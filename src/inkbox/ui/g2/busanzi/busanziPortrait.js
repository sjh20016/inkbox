// Dedicated vector *silhouette*. Identifying marks from approved user reference.
// Both Li trigrams are represented by six bars: solid / split / solid, repeated.
export function busanziPortraitSvg({wind=false}={}){
  const paperShift=wind?'transform="translate(-3 -3) rotate(-5 55 40)"':"";
  const glimmer=wind?'<path d="M48 54 Q51 52 54 54 M49 63 Q51 64 53 62" fill="none" stroke="#876e62" stroke-width="1" opacity=".55"/>':"";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 136" aria-hidden="true">'+
  '<rect width="120" height="136" fill="#ede8dd"/>'+
  '<circle cx="94" cy="25" r="33" fill="none" stroke="#a8b2a8" opacity=".6"/>'+
  '<path d="M8 50 Q15 13 56 6 Q88 8 111 52" fill="#caba9f" stroke="#443e36" stroke-width="2"/>'+
  '<path d="M8 50 L56 6 L109 51 M56 6 L56 66 M56 6 L25 22 M56 6 L91 23" stroke="#7f6c53" stroke-width="1.4"/>'+
  '<path d="M14 51 L102 51" stroke="#756348" stroke-width="2"/>'+
  '<path d="M25 117 Q16 77 28 40 Q35 20 55 18 Q79 14 89 42 Q97 77 94 117Z" fill="#292c30" stroke="#252725" stroke-width="2"/>'+
  '<path d="M7 136 Q14 101 31 96 L49 100 L67 96 Q103 100 113 136" fill="#e6ddd0" stroke="#413e39" stroke-width="2"/>'+
  '<path d="M30 102 L50 120 L69 102 L62 97 L49 111 L36 97" fill="#924940" stroke="#51453e" stroke-width="1.5"/>'+
  '<path d="M25 67 Q16 28 41 22 Q62 12 80 32 Q88 48 81 71 L74 39 Q57 35 42 42 L34 77Z" fill="#25282b" stroke="#252725" stroke-width="2"/>'+
  '<path d="M34 52 Q33 74 50 86 Q68 80 74 52 Q72 36 51 36 Q37 36 34 52Z" fill="#e9c7ad" stroke="#393530" stroke-width="1.5"/>'+glimmer+
  '<path d="M30 50 Q26 73 36 95 M75 47 Q82 68 74 97" fill="none" stroke="#25282b" stroke-width="7" stroke-linecap="round"/>'+
  '<path d="M27 40 Q52 31 84 42" stroke="#a3453b" stroke-width="3.5" fill="none" stroke-dasharray="3 1"/>'+
  '<circle cx="84" cy="43" r="3.5" fill="#b58a54" stroke="#514635"/>'+
  '<path d="M84 46 L89 56" stroke="#a3453b" stroke-width="1.5"/>'+
  '<path d="M82 55 Q89 52 94 55 L92 63 L84 63Z" fill="#ad8657" stroke="#514635"/>'+
  '<g '+paperShift+'><path d="M43 38 L70 38 L71 76 L67 80 L63 76 L59 82 L55 77 L50 81 L47 77 L43 80Z" fill="#f1ddb7" stroke="#51443a" stroke-width="1.3"/>'+
  '<g fill="#9b362f"><rect x="47" y="43" width="20" height="2.7"/>'+
  '<rect x="47" y="49" width="8.5" height="2.7"/><rect x="58.5" y="49" width="8.5" height="2.7"/>'+
  '<rect x="47" y="55" width="20" height="2.7"/><rect x="47" y="61" width="20" height="2.7"/>'+
  '<rect x="47" y="67" width="8.5" height="2.7"/><rect x="58.5" y="67" width="8.5" height="2.7"/>'+
  '<rect x="47" y="73" width="20" height="2.7"/></g></g>'+
  '<path d="M22 136 Q31 112 39 106 M99 136 Q87 111 79 108" fill="none" stroke="#b5aa99" stroke-width="1.4"/>'+
  '<path d="M47 118 Q52 125 57 118" fill="none" stroke="#413c33" stroke-width="1.4"/>'+
  '<circle cx="54" cy="119" r="2.4" fill="#af8856" stroke="#514536"/>'+
  '</svg>';
}
