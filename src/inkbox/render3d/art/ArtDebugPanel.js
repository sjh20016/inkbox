import { ART_CONTROLS, ART_PROFILES } from './ArtPassProfile.js';

/** Developer-only profile controls. No listeners survive adapter disposal. */
export class ArtDebugPanel {
  constructor(host, parent) {
    this.host = host; this.abort = new AbortController();
    const el = this.element = document.createElement('details');
    el.id = 'inkArtDebug';
    el.style.cssText = 'position:absolute;right:12px;top:62px;z-index:5;background:#f5f2eaf0;border:1px solid #aaa18e;padding:8px;font:12px sans-serif;max-height:70%;overflow:auto;width:240px';
    const summary = document.createElement('summary'); summary.textContent = 'Art · 写意调试'; el.append(summary);
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Art profile');
    for (const name of Object.keys(ART_PROFILES)) select.add(new Option(name, name));
    select.value = host.art.profile.name;
    select.addEventListener('change', () => { host.setArtProfile(select.value); this.refresh(); }, { signal: this.abort.signal });
    el.append(select); this.inputs = new Map();
    const lodLabel = document.createElement('label'); lodLabel.style.cssText = 'display:block;margin:7px 0';
    const lod = document.createElement('input'); lod.type = 'checkbox'; lod.checked = host.lodEnabled;
    lod.setAttribute('aria-label', 'Geometry LOD');
    lod.addEventListener('change', () => host.setLODEnabled(lod.checked), { signal: this.abort.signal });
    lodLabel.append(lod, document.createTextNode(' Geometry LOD')); el.append(lodLabel);
    for (const key of ['paperColor', ...Object.keys(ART_CONTROLS)]) {
      const label = document.createElement('label'); label.style.cssText = 'display:block;margin:7px 0';
      const text = document.createElement('span'); text.textContent = key; label.append(text);
      const input = document.createElement('input'); input.setAttribute('aria-label', key);
      input.type = key === 'paperColor' ? 'color' : 'range';
      if (ART_CONTROLS[key]) [input.min,input.max,input.step] = ART_CONTROLS[key].map(String);
      input.style.cssText = 'width:110px;float:right';
      input.addEventListener('input', () => host.setArtProfile({ [key]: key === 'paperColor' ? input.value : Number(input.value) }), { signal: this.abort.signal });
      label.append(input); el.append(label); this.inputs.set(key,input);
    }
    const button = document.createElement('button'); button.textContent = '导出 Profile JSON';
    button.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(host.art.profile,null,2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'Inkbox-ArtProfile.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, { signal: this.abort.signal });
    el.append(button); parent.append(el); this.refresh();
  }
  refresh() { for (const [key,input] of this.inputs) input.value = this.host.art.profile[key]; }
  dispose() { this.abort.abort(); this.element.remove(); this.host = null; }
}
