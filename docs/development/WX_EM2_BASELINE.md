# WX-E-M2 frozen baseline

The audited product candidate is PR #72, `9668e392e53a9ddf6159efe0c67d900802c98a7f`, tree `9b9b4942eef05de1220866ca9daecc1ab52fd734`. The source PR heads/bases and exact existing CI run are retained in `WX_EM2_FROZEN_REFS.json`. No source PR was merged again. No main or upstream ref was changed.

All 17 local commands required by the commission passed on the unchanged combined source, including save-equivalence, three-realms, build and package audit. `npm ci` passed on Node 24.11.1. Full logs and timestamps are in `reports/local/wx-em2/baseline/`, with `results.json` recording every exit code. Existing Fast and Heavy remain intact; browser smoke was skipped in the old CI and is measured independently here.

Inputs are the original `20260914-100y-save.json` and `20260914-400y-save.json` from the existing WX-S1 natural run. They contain v11/G8 runtime and natural mortal days 36000/144000, 540/1399 entities. The 400-year run resumed its genuine 100-year checkpoint. These are inherited inputs, not #72 acceptance results. Exact input bytes and SHA256 are recorded per new run. Natural centuries of upper/nether simulation are not claimed: browser protocol adds formally generated, explicitly controlled child realms, while Node natural comparisons keep the original mortal-only checkpoint.

The previously described E-line evidence zip is not available in this workspace. Existing older S1 profiles and architecture-review screenshots do not supply #72 segmented long-frame timestamps. This missing source is recorded; the new runs supply the outstanding evidence without recreating centuries of simulation.

Git smart HTTPS was unavailable and the local gh credential was invalid. The isolated shallow checkout was recovered using GitHub connector metadata and verified raw Git objects. Every source blob, complete tree and commit identity matched upstream. Three initially missing historical PNG previews were subsequently recovered through base64 file reads and matched their Git hashes. No missing runtime/source files or sparse omissions remain. The frozen #72 reference has a separate unchanged checkout `../inkbox-wx-em2-base` and an independently checked source-only export.

Reproduce: `npm ci`, the 17 commands in the commission, then `npm run test:wx-em2:native -- --checkpoint-root=<original-checkpoints>`. The latter verifies the frozen baseline Git blobs and compares the same feature set; it deliberately does not compare different S1 rule versions or different dt sequences.
