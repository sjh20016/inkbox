import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { writePsdBuffer } from 'ag-psd';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const LAYER_NAMES = JSON.parse(await readFile(resolve(HERE, 'layer-names.zh-CN.json'), 'utf8'));
const WIDTH = 1024;
const HEIGHT = 1024;
const INK = '#293033';
const HAIR = '#252c2d';
const SKIN = '#e5c0a3';
const SKIN_DARK = '#ce9e80';
const PAPER = '#f1eee5';
const GOLD = '#bda27a';
const FORCE = process.argv.includes('--force');

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

function profileCandidates() {
  if (process.platform === 'win32') return [
    'C:/Windows/System32/spool/drivers/color/sRGB Color Space Profile.icm'
  ];
  if (process.platform === 'darwin') return [
    '/System/Library/ColorSync/Profiles/sRGB Profile.icc',
    '/System/Library/ColorSync/Profiles/sRGB IEC61966-2.1.icc'
  ];
  return [
    '/usr/share/color/icc/colord/sRGB.icc',
    '/usr/share/color/icc/ghostscript/srgb.icc',
    '/usr/share/color/icc/sRGB.icc'
  ];
}

async function findSrgbProfile() {
  const explicit = option('--icc');
  for (const candidate of explicit ? [resolve(explicit)] : profileCandidates()) {
    try {
      const profile = await readFile(candidate);
      if (profile.length >= 128 && profile.toString('ascii', 36, 40) === 'acsp') return profile;
    } catch { /* try the next standard OS profile location */ }
  }
  throw new Error('An sRGB ICC profile is required. Install the standard sRGB profile or pass --icc <path-to-sRGB.icc>.');
}

function attachIccProfile(psd, profile) {
  // PSD image resource 0x040F is the ICC profile. Insert it into the normal
  // image-resources section so the file remains an ordinary RGB PSD.
  const bytes = Buffer.from(psd);
  if (bytes.toString('ascii', 0, 4) !== '8BPS' || bytes.readUInt16BE(4) !== 1) {
    throw new Error('PSD writer returned an invalid version-1 PSD header.');
  }
  if (bytes.readUInt16BE(12) !== 3 || bytes.readUInt16BE(24) !== 3) {
    throw new Error('PSD must be RGB, 8 bits per channel.');
  }
  let offset = 26;
  const colorModeLength = bytes.readUInt32BE(offset);
  offset += 4 + colorModeLength;
  const resourceLengthOffset = offset;
  const resourceLength = bytes.readUInt32BE(resourceLengthOffset);
  const resourceStart = resourceLengthOffset + 4;
  const resourceEnd = resourceStart + resourceLength;
  if (resourceEnd > bytes.length) throw new Error('PSD image-resources section is truncated.');

  const name = Buffer.from([0, 0]); // empty Pascal name, padded to an even byte count
  const dataLength = Buffer.alloc(4);
  dataLength.writeUInt32BE(profile.length);
  const pad = profile.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
  const record = Buffer.concat([Buffer.from('8BIM'), Buffer.from([0x04, 0x0f]), name, dataLength, profile, pad]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(resourceLength + record.length);
  return Buffer.concat([bytes.subarray(0, resourceLengthOffset), length, bytes.subarray(resourceStart, resourceEnd), record, bytes.subarray(resourceEnd)]);
}

function layerName(sourceName) {
  const localized = LAYER_NAMES[sourceName];
  if (!localized) throw new Error(`Missing Chinese display name for PSD layer: ${sourceName}`);
  return localized;
}

function svg(inner = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${inner}</svg>`;
}

const path = (d, fill = 'none', stroke = INK, width = 14, extra = '') =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const ellipse = (cx, cy, rx, ry, fill = 'none', stroke = INK, width = 10, extra = '') =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;

async function pixel(name, art, hidden = false, opacity = 1) {
  const { data, info } = await sharp(Buffer.from(svg(art))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== WIDTH || info.height !== HEIGHT || info.channels !== 4) {
    throw new Error(`Unexpected raster dimensions for ${name}: ${info.width}x${info.height}x${info.channels}`);
  }
  return { name: layerName(name), hidden, opacity, imageData: { width: WIDTH, height: HEIGHT, data: new Uint8Array(data) } };
}

// Builder declarations and PSD layer records use bottom-to-top order. Photoshop
// displays those records top-to-bottom, so preserve sibling order in the tree.
const group = (name, children = [], hidden = false) => ({ name: layerName(name), hidden, opened: true, children });
const placeholder = name => group(name);

async function compositeVisible(tree) {
  const visiblePixels = [];
  const visit = (node, inheritedHidden = false) => {
    const hidden = inheritedHidden || node.hidden === true;
    const opacity = Number.isFinite(node.opacity) ? Math.max(0, Math.min(1, node.opacity)) : 1;
    if (hidden) return;
    if (node.children) {
      for (const child of node.children) visit(child, hidden);
    } else if (node.imageData) {
      if (opacity >= 1) visiblePixels.push(node.imageData.data);
      else {
        const pixels = new Uint8Array(node.imageData.data);
        for (let index = 3; index < pixels.length; index += 4) pixels[index] = Math.round(pixels[index] * opacity);
        visiblePixels.push(pixels);
      }
    }
  };
  for (const root of tree) visit(root);
  const overlays = [];
  for (const data of visiblePixels) {
    overlays.push({ input: await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width: WIDTH, height: HEIGHT, channels: 4 }
    }).png().toBuffer() });
  }
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(overlays).png().withIccProfile('srgb').toBuffer();
}

function visibilityVariant(nodes, overrides) {
  return nodes.map(node => ({
    ...node,
    ...(Object.hasOwn(overrides, node.name) ? { hidden: !overrides[node.name] } : {}),
    ...(node.children ? { children: visibilityVariant(node.children, overrides) } : {})
  }));
}

async function makeMaster() {
  const backHairLoose = group('variant-loose-01', [
    await pixel('hair-shape', path('M 268 408 C 214 258 320 118 500 104 C 688 91 805 235 745 438 C 722 531 736 632 806 757 C 698 757 643 690 619 575 C 567 519 446 531 392 599 C 353 535 332 469 268 408 Z', HAIR, INK, 18)),
    await pixel('hair-shadow', path('M 276 361 C 297 224 400 142 502 132 C 407 200 376 290 391 412 C 360 437 340 473 330 512 C 302 468 286 419 276 361 Z', '#151b1d', 'none', 0)),
    await pixel('long-tail', path('M 695 367 C 772 416 803 548 785 715 C 780 777 748 824 707 834 C 746 740 739 623 695 538 Z', HAIR, INK, 15)),
    await pixel('rear-highlight', path('M 347 276 C 376 188 437 148 493 139', 'none', '#566061', 10))
  ]);
  const backHairBun = group('variant-bun-01', [
    await pixel('hair-shape', path('M 278 398 C 230 253 327 120 500 106 C 668 91 786 221 750 417 C 725 506 690 558 644 576 C 629 487 581 447 514 443 C 435 438 388 479 365 563 C 322 523 294 467 278 398 Z', HAIR, INK, 18)),
    await pixel('hair-shadow', path('M 289 349 C 304 220 397 143 501 132 C 415 199 382 279 391 402 C 354 429 333 465 321 497 C 305 451 294 398 289 349 Z', '#151b1d', 'none', 0)),
    await pixel('bun', ellipse(639, 184, 80, 82, HAIR, INK, 17)),
    await pixel('bun-highlight', path('M 601 147 C 634 110 678 111 702 144', 'none', '#566061', 10))
  ], true);

  const robeSage = group('variant-sage-cross-01', [
    await pixel('shoulders-and-body', path('M 160 1008 C 174 869 276 810 405 802 L 510 832 L 617 802 C 750 810 850 869 864 1008 Z', '#afc3b8', INK, 17)),
    await pixel('cross-collar-underlay', path('M 404 808 L 511 954 L 620 808 L 735 850 L 603 1008 L 421 1008 L 285 851 Z', '#e8e2d4', INK, 13)),
    await pixel('cross-collar-overlay', path('M 408 817 L 510 930 L 612 817 L 660 837 L 553 1008 L 469 1008 L 351 838 Z', '#91a99e', 'none', 0)),
    await pixel('collar-trim', path('M 408 817 L 510 930 L 612 817', 'none', '#e1d0a8', 10)),
    await pixel('robe-shade', path('M 180 985 C 264 906 332 874 414 866 L 365 1008 L 180 1008 Z', '#96afa3', 'none', 0)),
    await pixel('robe-mark', path('M 741 927 C 769 938 787 958 789 979', 'none', GOLD, 9))
  ]);
  const robePaper = group('variant-paper-scholar-01', [
    await pixel('shoulders-and-body', path('M 160 1008 C 174 869 276 810 405 802 L 510 832 L 617 802 C 750 810 850 869 864 1008 Z', '#e6e1d2', INK, 17)),
    await pixel('scholar-collar-underlay', path('M 411 810 L 510 914 L 610 810 L 689 846 L 585 982 L 439 982 L 330 846 Z', '#d4cab9', INK, 13)),
    await pixel('scholar-collar-overlay', path('M 420 816 L 510 899 L 600 816 L 628 829 L 544 944 L 477 944 L 392 829 Z', '#8e9d98', 'none', 0)),
    await pixel('collar-trim', path('M 420 816 L 510 899 L 600 816', 'none', '#d0ad74', 9)),
    await pixel('robe-shade', path('M 180 985 C 264 906 332 874 414 866 L 365 1008 L 180 1008 Z', '#d8d2c2', 'none', 0)),
    await pixel('robe-mark', path('M 741 927 C 769 938 787 958 789 979', 'none', '#a77862', 9))
  ], true);

  const neck = group('neck-base', [
    await pixel('neck-skin', path('M 419 697 C 446 755 463 778 512 785 C 559 778 579 752 604 695 L 635 846 C 596 893 554 912 510 913 C 463 912 420 893 384 846 Z', SKIN, INK, 13)),
    await pixel('neck-shadow', path('M 416 763 C 450 795 474 805 512 807 C 551 805 576 793 608 761 L 615 819 C 573 852 543 862 511 862 C 479 862 448 852 408 819 Z', SKIN_DARK, 'none', 0))
  ]);

  const face = group('variant-oval-01', [
    await pixel('face-base-skin', path('M 319 330 C 319 226 398 154 511 154 C 625 154 705 227 705 330 C 705 469 669 605 607 701 C 579 744 546 773 512 777 C 476 773 444 744 415 701 C 353 605 319 469 319 330 Z', SKIN, 'none', 0)),
    await pixel('face-outline', path('M 319 330 C 319 226 398 154 511 154 C 625 154 705 227 705 330 C 705 469 669 605 607 701 C 579 744 546 773 512 777 C 476 773 444 744 415 701 C 353 605 319 469 319 330 Z', 'none', INK, 19)),
    await pixel('soft-cheek-shadow', path('M 344 498 C 365 600 405 667 455 716 C 422 664 408 613 406 562 C 384 529 363 507 344 498 Z', '#d8aa8e', 'none', 0, 'opacity="0.33"')),
    placeholder('face-shape-corrections'),
    placeholder('complexion-mask')
  ]);
  const faceRound = group('variant-round-01', [
    await pixel('face-base-skin', path('M 306 333 C 302 229 391 154 511 154 C 632 154 721 229 717 333 C 712 463 677 585 615 681 C 584 727 550 756 512 762 C 473 756 439 727 408 681 C 346 585 311 463 306 333 Z', SKIN, 'none', 0)),
    await pixel('face-outline', path('M 306 333 C 302 229 391 154 511 154 C 632 154 721 229 717 333 C 712 463 677 585 615 681 C 584 727 550 756 512 762 C 473 756 439 727 408 681 C 346 585 311 463 306 333 Z', 'none', INK, 19)),
    await pixel('soft-cheek-shadow', path('M 335 490 C 356 584 401 652 452 703 C 421 651 406 604 402 554 C 379 520 357 497 335 490 Z', '#d8aa8e', 'none', 0, 'opacity="0.30"')),
    placeholder('face-shape-corrections'), placeholder('complexion-mask')
  ], true);

  const earLayers = [
    await pixel('left-ear', ellipse(311, 555, 45, 72, SKIN, INK, 15)),
    await pixel('right-ear', ellipse(713, 555, 45, 72, SKIN, INK, 15)),
    await pixel('ear-detail-left', path('M 294 563 C 296 533 327 525 338 553 C 322 550 317 573 324 591', 'none', SKIN_DARK, 10)),
    await pixel('ear-detail-right', path('M 730 563 C 727 533 697 525 686 553 C 702 550 707 573 700 591', 'none', SKIN_DARK, 10)),
    placeholder('special-ear-shapes')
  ];
  // Eye layers use explicit left/right hand-authored coordinates; no face pixels are included.
  const eyeGroup = async (round, visible) => group(`variant-${round ? 'round' : 'calm'}-01`, [
    group('left-eye', [
      group('eye-white', [await pixel('sclera', path('M 365 516 C 383 487 421 481 452 498 C 463 504 470 511 474 517 C 452 543 408 545 381 529 Z', '#fffaf0', INK, 7))]),
      group('upper-line', [await pixel('upper-eyelid', path(round ? 'M 361 517 C 381 478 424 469 458 492 C 467 499 472 508 475 517' : 'M 361 517 C 384 484 424 476 458 496 C 467 502 472 510 475 517', 'none', INK, 14))]),
      group('lower-line', [await pixel('lower-eyelid', path('M 368 522 C 394 548 432 547 463 528', 'none', '#4f5655', 8))]),
      group('lashes', [await pixel('outer-lashes', path('M 370 507 L 352 496 M 382 492 L 371 476', 'none', INK, 8))]),
      group('iris', [await pixel('iris', ellipse(421, round ? 519 : 521, 24, round ? 30 : 25, '#805b43', 'none', 0))]),
      group('pupil', [await pixel('pupil', ellipse(421, 521, 10, 15, INK, 'none', 0))]),
      group('highlight', [await pixel('highlight', ellipse(430, 508, 7, 9, '#fffaf0', 'none', 0))]),
      placeholder('lid-shadow'), placeholder('heterochromia-reserve'), placeholder('abnormal-pupil-reserve')
    ]),
    group('right-eye', [
      group('eye-white', [await pixel('sclera', path('M 550 517 C 554 511 561 504 572 498 C 603 481 641 487 659 516 L 643 529 C 616 545 572 543 550 517 Z', '#fffaf0', INK, 7))]),
      group('upper-line', [await pixel('upper-eyelid', path(round ? 'M 549 517 C 552 508 557 499 566 492 C 600 469 643 478 663 517' : 'M 549 517 C 552 510 557 502 566 496 C 600 476 640 484 663 517', 'none', INK, 14))]),
      group('lower-line', [await pixel('lower-eyelid', path('M 561 528 C 592 547 630 548 656 522', 'none', '#4f5655', 8))]),
      group('lashes', [await pixel('outer-lashes', path('M 654 507 L 672 496 M 642 492 L 653 476', 'none', INK, 8))]),
      group('iris', [await pixel('iris', ellipse(603, round ? 519 : 521, 24, round ? 30 : 25, '#805b43', 'none', 0))]),
      group('pupil', [await pixel('pupil', ellipse(603, 521, 10, 15, INK, 'none', 0))]),
      group('highlight', [await pixel('highlight', ellipse(612, 508, 7, 9, '#fffaf0', 'none', 0))]),
      placeholder('lid-shadow'), placeholder('heterochromia-reserve'), placeholder('abnormal-pupil-reserve')
    ])
  ], !visible);

  const makeBrows = async (type, hidden) => {
    const sword = type === 'sword';
    return group(`variant-${type}-01`, [
      group('left-brow', [await pixel('left-shape', path(sword ? 'M 366 452 C 394 428 431 419 461 433' : 'M 370 446 C 396 431 430 429 457 438', 'none', HAIR, sword ? 17 : 14))]),
      group('right-brow', [await pixel('right-shape', path(sword ? 'M 563 433 C 593 419 630 428 658 452' : 'M 567 438 C 594 429 628 431 654 446', 'none', HAIR, sword ? 17 : 14))]),
      placeholder('brow-color'), placeholder('shape-correction-left'), placeholder('shape-correction-right')
    ], hidden);
  };
  const makeMouth = async (smile, hidden) => group(`variant-${smile ? 'smile' : 'neutral'}-01`, [
    await pixel('lip-tint', path('M 458 696 Q 486 680 512 694 Q 538 680 566 696 Q 541 728 512 728 Q 483 728 458 696 Z', '#bf806d', 'none', 0, 'opacity="0.48"')),
    await pixel('mouth-main-line', path(smile ? 'M 462 696 Q 512 752 562 696' : 'M 463 700 Q 512 709 561 700', 'none', '#633d39', 13)),
    placeholder('mouth-corners'), placeholder('expression-change')
  ], hidden);

  const stateMarks = [
    group('age', [group('age-lines', [await pixel('temple-lines', path('M 365 551 Q 381 558 395 570 M 369 566 Q 383 573 396 584 M 629 570 Q 643 558 659 551 M 628 584 Q 642 573 655 566', 'none', '#956f60', 7))])], true),
    group('injury', [group('bruise-small', [await pixel('bruise', ellipse(391, 613, 34, 19, '#9e5360', 'none', 0, 'opacity="0.48"'))]), group('bandage-reserve')], true),
    group('scar', [group('permanent-scar', [await pixel('scar-line', path('M 382 476 C 401 510 410 536 420 566', 'none', '#8c5148', 10)), await pixel('scar-highlight', path('M 376 477 C 394 513 403 536 411 556', 'none', '#f1d4bb', 4))])], true),
    group('technique', [group('fire', [await pixel('fire-mark-reserve', path('M 0 0 L 0 1', 'none', 'none', 0))]), group('frost-reserve')], true),
    group('corruption', [group('corruption-mark-1', [await pixel('vein-mark', path('M 614 622 C 637 605 632 579 658 561 M 621 626 C 646 635 654 651 664 668', 'none', '#743b48', 9))])], true),
    group('curse-reserve'),
    group('ghost', [group('ghost-wash', [await pixel('ghost-complexion-wash', path('M 322 355 C 330 259 405 177 512 177 C 619 177 694 259 702 355 C 693 492 660 617 603 698 C 575 737 545 760 512 763 C 479 760 449 737 421 698 C 364 617 331 492 322 355 Z', '#a7bdc1', 'none', 0, 'opacity="0.52"'))])], true),
    group('mutation-reserve'),
    group('possession-reserve')
  ];

  const frontHairPart = group('variant-part-01', [
    await pixel('hair-mass', path('M 305 381 C 280 225 374 112 510 107 C 644 106 740 214 716 374 C 673 326 645 286 627 238 C 581 306 526 351 440 371 C 395 382 352 382 305 381 Z', HAIR, INK, 17)),
    await pixel('left-side-strand', path('M 306 356 C 290 438 307 505 351 559 C 368 522 375 466 369 408', HAIR, INK, 12)),
    await pixel('right-side-strand', path('M 716 350 C 730 425 714 497 677 552 C 661 513 657 464 665 405', HAIR, INK, 12)),
    await pixel('bangs', path('M 369 354 C 432 340 491 314 542 269 C 572 310 613 338 670 355 C 626 367 584 355 550 335 C 506 375 441 393 369 382 Z', HAIR, INK, 14)),
    await pixel('hair-highlight', path('M 402 228 C 444 173 503 151 566 160', 'none', '#596263', 9)),
    placeholder('hairline-correction')
  ]);
  const frontHairSweep = group('variant-sweep-01', [
    await pixel('hair-mass', path('M 301 378 C 278 221 376 111 510 106 C 650 104 742 213 713 372 C 663 332 629 284 617 228 C 566 299 496 337 410 356 C 370 365 336 372 301 378 Z', HAIR, INK, 17)),
    await pixel('left-side-strand', path('M 304 351 C 293 433 310 499 350 555 C 367 518 374 465 367 405', HAIR, INK, 12)),
    await pixel('right-side-strand', path('M 711 347 C 725 424 710 492 676 548 C 660 510 655 459 663 401', HAIR, INK, 12)),
    await pixel('swept-bang', path('M 351 351 C 437 338 512 300 578 240 C 612 208 636 172 647 142 C 662 222 655 298 625 359 C 555 375 495 359 448 344 C 412 357 380 366 351 371 Z', HAIR, INK, 14)),
    await pixel('hair-highlight', path('M 407 220 C 450 169 514 147 573 158', 'none', '#596263', 9)),
    placeholder('hairline-correction')
  ], true);

  const ornament = group('ornament-pin-01', [
    await pixel('pin-stem', path('M 673 170 C 685 190 687 214 679 240', 'none', '#d5b979', 9)),
    await pixel('pin-head', path('M 672 156 C 690 143 706 151 710 166 C 702 181 686 183 674 174 Z', '#a94f44', '#623a35', 6)),
    group('ribbon-reserve'), group('bead-reserve'), group('宗门装饰-reserve'), group('额饰及角-reserve')
  ]);
  const busuanziSealed = group('busuanzi-talisman-sealed-01', [
    await pixel('paper-shadow', path('M 311 310 L 715 310 L 715 741 L 311 741 Z', '#b3a08a', 'none', 0, 'opacity="0.25"')),
    await pixel('paper-body', path('M 301 300 L 705 300 L 705 732 L 301 732 Z', '#ead39f', '#8e6c4b', 10)),
    await pixel('paper-edge', path('M 322 321 L 684 321 L 684 710 L 322 710 Z', 'none', '#c4a970', 5)),
    await pixel('li-trigram-top-yang', path('M 421 432 L 580 432', 'none', '#b64338', 18)),
    await pixel('li-trigram-middle-yin-left', path('M 421 490 L 480 490', 'none', '#b64338', 18)),
    await pixel('li-trigram-middle-yin-right', path('M 521 490 L 580 490', 'none', '#b64338', 18)),
    await pixel('li-trigram-bottom-yang', path('M 421 548 L 580 548', 'none', '#b64338', 18)),
    await pixel('talisman-knot', path('M 494 302 Q 512 277 530 302 M 512 302 L 512 326', 'none', '#9a5642', 7))
  ], true);
  const busuanziWind = group('busuanzi-talisman-wind-01', [
    await pixel('paper-shadow', path('M 322 316 L 708 295 L 728 710 L 337 733 Z', '#b3a08a', 'none', 0, 'opacity="0.18"'), false, 0.86),
    await pixel('paper-body-lifted', path('M 310 305 L 696 284 L 716 699 L 325 722 Z', '#ead39f', '#8e6c4b', 9), false, 0.86),
    await pixel('paper-edge-lifted', path('M 331 326 L 676 307 L 694 677 L 346 698 Z', 'none', '#c4a970', 5), false, 0.86),
    await pixel('li-trigram-top-yang', path('M 425 433 L 572 427', 'none', '#b64338', 16), false, 0.8),
    await pixel('li-trigram-middle-yin-left', path('M 427 487 L 480 485', 'none', '#b64338', 16), false, 0.8),
    await pixel('li-trigram-middle-yin-right', path('M 517 483 L 574 481', 'none', '#b64338', 16), false, 0.8),
    await pixel('li-trigram-bottom-yang', path('M 429 541 L 577 535', 'none', '#b64338', 16), false, 0.8),
    await pixel('folded-corner', path('M 696 284 Q 752 328 716 394 L 681 351 Z', '#f4e5c3', '#8e6c4b', 8), false, 0.9),
    await pixel('talisman-knot', path('M 494 305 Q 512 282 530 304 M 512 304 L 513 326', 'none', '#9a5642', 7), false, 0.8)
  ], true);

  const slots = [];
  slots.push(group('00_background', [group('variant-round-01', [
    await pixel('paper-base', `<rect width="1024" height="1024" fill="${PAPER}"/>`),
    await pixel('motif-round-01', `<circle cx="512" cy="432" r="345" fill="#e6dfd1"/><circle cx="512" cy="432" r="307" fill="none" stroke="#d2c7b5" stroke-width="5"/>`),
    await pixel('background-specks', `<circle cx="206" cy="207" r="6" fill="#c9bdac"/><circle cx="804" cy="711" r="5" fill="#c9bdac"/>`)
  ])]));
  slots.push(group('01_backHair', [backHairLoose, backHairBun, placeholder('hair-knot-reserve'), placeholder('rear-ornament-reserve'), placeholder('horns-behind-hair-reserve')]));
  slots.push(group('02_robe', [robeSage, robePaper, placeholder('identity-clothing-detail-reserve'), placeholder('deep-garment-occlusion-reserve')]));
  slots.push(group('03_neck', [neck]));
  slots.push(group('04_face', [face, faceRound]));
  slots.push(group('05_ears', [group('ears-base', earLayers)]));
  slots.push(group('06_eyes', [await eyeGroup(false, true), await eyeGroup(true, false)]));
  slots.push(group('07_brows', [await makeBrows('level', false), await makeBrows('sword', true)]));
  slots.push(group('08_nose', [group('nose-dot-01', [await pixel('nose-soft-shadow', ellipse(512, 625, 10, 7, '#d2a58b', 'none', 0, 'opacity="0.6"')), await pixel('nose-tip', ellipse(512, 624, 5, 4, INK, 'none', 0))]), placeholder('nose-fine-stroke-reserve')]));
  slots.push(group('09_mouth', [await makeMouth(false, false), await makeMouth(true, true)]));
  slots.push(group('10_cheeks', [group('cheeks-base', [await pixel('blush', `${ellipse(384, 605, 29, 13, '#ca8877', 'none', 0, 'opacity="0.34"')}${ellipse(641, 605, 29, 13, '#ca8877', 'none', 0, 'opacity="0.34"')}`)])]));
  slots.push(group('11_skinMarks', stateMarks));
  slots.push(group('12_frontHair', [frontHairPart, frontHairSweep, placeholder('flyaway-strands-reserve'), placeholder('forehead-organ-reserve')]));
  slots.push(group('13_ornament', [ornament, busuanziSealed, busuanziWind]));
  slots.push(group('14_effects', [
    group('behind-backHair', [await pixel('rear-spirit-haze-reserve', ellipse(512, 425, 405, 405, '#a7bdc1', 'none', 0, 'opacity="0.12"'))], true),
    group('front', [
      group('technique-fire', [await pixel('fire-aura', path('M 281 692 C 242 643 275 612 250 572 C 309 600 328 650 313 690 M 740 702 C 783 654 755 619 781 576 C 718 603 702 656 717 698', 'none', '#c56f43', 15))], true),
      group('technique-frost', [await pixel('frost-aura', path('M 283 672 C 257 632 279 605 260 578 M 741 683 C 774 644 749 615 771 587', 'none', '#76a9b4', 13))], true),
      group('wind-gust-soft-01', [await pixel('left-gust', path('M 193 426 C 237 406 277 414 318 435 M 185 467 C 227 450 259 454 292 470 M 725 411 C 773 396 811 407 850 429 M 735 451 C 773 440 806 448 835 464', 'none', '#78939a', 9), false, 0.68)], true),
      group('ghost-light-reserve'), group('magic-smoke-reserve'), group('transformation-foreground-reserve')
    ])
  ]));
  slots.push(group('15_frame', [group('frame-base', [
    await pixel('corner-lines', path('M 80 204 L 80 80 L 204 80 M 820 80 L 944 80 L 944 204 M 80 820 L 80 944 L 204 944 M 820 944 L 944 944 L 944 820', 'none', '#b9ad98', 5, 'opacity="0.62"'))
  ])]));

  // Runtime paint order is bottom-to-top, matching the PSD layer records.
  return slots;
}

async function main() {
  const outputPath = resolve(ROOT, 'assets/portraits/source/inkbox_face_master_v1.psd');
  const previewPath = resolve(ROOT, 'assets/portraits/source/inkbox_face_master_preview.png');
  const researchPath = resolve(ROOT, 'research/g2-portrait-preview');
  const variationPaths = [
    resolve(researchPath, 'inkbox-face-master-busuanzi-sealed.png'),
    resolve(researchPath, 'inkbox-face-master-busuanzi-wind.png')
  ];
  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(researchPath, { recursive: true });
  if (!FORCE) {
    for (const file of [outputPath, previewPath, ...variationPaths]) {
      try { await stat(file); throw new Error(`Refusing to overwrite ${file}; pass --force for an intentional regeneration.`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  const profile = await findSrgbProfile();
  const rootsBottomToTop = await makeMaster();
  const preview = await compositeVisible(rootsBottomToTop);
  const sealedPreview = await compositeVisible(visibilityVariant(rootsBottomToTop, {
    [layerName('ornament-pin-01')]: false,
    [layerName('busuanzi-talisman-sealed-01')]: true,
    [layerName('busuanzi-talisman-wind-01')]: false,
    [layerName('wind-gust-soft-01')]: false
  }));
  const windPreview = await compositeVisible(visibilityVariant(rootsBottomToTop, {
    [layerName('ornament-pin-01')]: false,
    [layerName('busuanzi-talisman-sealed-01')]: false,
    [layerName('busuanzi-talisman-wind-01')]: true,
    [layerName('wind-gust-soft-01')]: true
  }));
  const document = {
    width: WIDTH,
    height: HEIGHT,
    channels: 3,
    bitsPerChannel: 8,
    colorMode: 3,
    imageResources: {
      resolutionInfo: {
        horizontalResolution: 72, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches',
        verticalResolution: 72, verticalResolutionUnit: 'PPI', heightUnit: 'Inches'
      }
    },
    imageData: { width: WIDTH, height: HEIGHT, data: new Uint8Array(await sharp(preview).ensureAlpha().raw().toBuffer()) },
    children: rootsBottomToTop
  };
  const psd = attachIccProfile(writePsdBuffer(document), profile);
  const psdTemporary = `${outputPath}.tmp`;
  const previewTemporary = `${previewPath}.tmp`;
  const sealedTemporary = `${variationPaths[0]}.tmp`;
  const windTemporary = `${variationPaths[1]}.tmp`;
  await writeFile(psdTemporary, psd);
  await writeFile(previewTemporary, preview);
  await writeFile(sealedTemporary, sealedPreview);
  await writeFile(windTemporary, windPreview);
  const { rename } = await import('node:fs/promises');
  await rename(psdTemporary, outputPath);
  await rename(previewTemporary, previewPath);
  await rename(sealedTemporary, variationPaths[0]);
  await rename(windTemporary, variationPaths[1]);
  const bytes = (await stat(outputPath)).size;
  const pixelLayers = countPixels(rootsBottomToTop);
  const groups = countGroups(rootsBottomToTop);
  console.log(`Wrote ${outputPath}`);
  console.log(`Wrote ${previewPath}`);
  console.log(`Wrote ${variationPaths[0]}`);
  console.log(`Wrote ${variationPaths[1]}`);
  console.log(`PSD ${WIDTH}x${HEIGHT}, RGB/8, embedded sRGB ICC (${profile.length} bytes), ${pixelLayers} pixel layers, ${groups} groups, ${bytes} bytes.`);
}

function countPixels(nodes) {
  return nodes.reduce((count, node) => count + (node.imageData ? 1 : 0) + (node.children ? countPixels(node.children) : 0), 0);
}
function countGroups(nodes) {
  return nodes.reduce((count, node) => count + (node.children ? 1 + countGroups(node.children) : 0), 0);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
