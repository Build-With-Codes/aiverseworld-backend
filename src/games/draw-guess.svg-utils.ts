function createSvg(children: string) {
  return `<svg class="draw-guess-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" stroke="#22d3ee" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

const fallbackTemplates: Record<string, string> = {
  cat: createSvg(`
    <circle cx="70" cy="60" r="18" />
    <circle cx="130" cy="60" r="18" />
    <path d="M52 46 L60 24 L76 44" />
    <path d="M124 44 L140 24 L148 46" />
    <circle cx="100" cy="110" r="38" />
    <path d="M90 108 Q100 118 110 108" />
    <path d="M84 102 L72 98" />
    <path d="M84 110 L70 110" />
    <path d="M116 102 L128 98" />
    <path d="M116 110 L130 110" />
  `),
  fish: createSvg(`
    <ellipse cx="92" cy="100" rx="48" ry="28" />
    <path d="M140 100 L174 74 L174 126 Z" />
    <circle cx="64" cy="94" r="4" fill="#22d3ee" />
    <path d="M84 94 Q100 108 118 106" />
    <path d="M98 76 L118 58" />
  `),
  bird: createSvg(`
    <circle cx="88" cy="94" r="36" />
    <circle cx="126" cy="74" r="20" />
    <path d="M146 74 L168 82 L146 88" />
    <path d="M70 96 Q104 48 144 64" />
    <path d="M84 132 L78 152" />
    <path d="M106 132 L112 152" />
  `),
  turtle: createSvg(`
    <path d="M56 116 Q64 70 100 70 Q136 70 144 116 Q128 146 100 148 Q72 146 56 116 Z" />
    <circle cx="152" cy="104" r="16" />
    <path d="M70 78 L58 62" />
    <path d="M130 78 L142 62" />
    <path d="M72 136 L58 150" />
    <path d="M128 136 L142 150" />
    <path d="M92 86 L108 102 L92 118 L76 102 Z" />
  `),
  apple: createSvg(`
    <path d="M100 52 Q126 52 138 76 Q148 98 138 124 Q126 152 100 152 Q74 152 62 124 Q52 98 62 76 Q74 52 100 52 Z" />
    <path d="M100 52 Q98 32 112 22" />
    <path d="M106 38 Q126 26 138 34" />
  `),
  pizza: createSvg(`
    <path d="M44 52 Q100 26 156 52 L100 156 Z" />
    <path d="M64 64 Q100 48 136 64" />
    <circle cx="88" cy="84" r="6" fill="#22d3ee" />
    <circle cx="114" cy="96" r="6" fill="#22d3ee" />
    <circle cx="98" cy="122" r="6" fill="#22d3ee" />
  `),
  burger: createSvg(`
    <path d="M60 84 Q100 48 140 84" />
    <path d="M56 92 H144" />
    <path d="M54 108 H146" />
    <path d="M60 124 H140" />
    <path d="M60 132 Q100 146 140 132" />
    <circle cx="82" cy="74" r="2" fill="#22d3ee" />
    <circle cx="100" cy="68" r="2" fill="#22d3ee" />
    <circle cx="118" cy="74" r="2" fill="#22d3ee" />
  `),
  'ice cream': createSvg(`
    <path d="M82 66 Q86 44 104 44 Q124 44 126 66 Q142 68 142 86 Q142 106 124 110 Q118 126 100 126 Q82 126 76 110 Q58 106 58 86 Q58 68 82 66 Z" />
    <path d="M86 126 L100 166 L114 126 Z" />
  `),
  chair: createSvg(`
    <path d="M70 64 H130" />
    <path d="M70 64 V106" />
    <path d="M130 64 V106" />
    <path d="M64 106 H136" />
    <path d="M78 106 V152" />
    <path d="M122 106 V152" />
  `),
  key: createSvg(`
    <circle cx="72" cy="88" r="24" />
    <path d="M94 88 H150" />
    <path d="M132 88 V104 H144 V96" />
    <path d="M118 88 V100 H130" />
  `),
  lamp: createSvg(`
    <path d="M70 80 Q100 46 130 80 Z" />
    <path d="M100 80 V128" />
    <path d="M78 144 H122" />
    <path d="M66 152 H134" />
  `),
  backpack: createSvg(`
    <path d="M72 66 Q76 42 100 42 Q124 42 128 66" />
    <path d="M64 74 Q64 58 80 58 H120 Q136 58 136 74 V138 Q136 152 122 152 H78 Q64 152 64 138 Z" />
    <path d="M82 94 H118" />
    <path d="M90 118 H110" />
  `),
  robot: createSvg(`
    <rect x="60" y="54" width="80" height="60" rx="12" />
    <circle cx="84" cy="82" r="6" fill="#22d3ee" />
    <circle cx="116" cy="82" r="6" fill="#22d3ee" />
    <path d="M86 98 H114" />
    <path d="M100 34 V54" />
    <path d="M76 114 V146" />
    <path d="M124 114 V146" />
    <path d="M60 122 L40 138" />
    <path d="M140 122 L160 138" />
  `),
  laptop: createSvg(`
    <rect x="56" y="54" width="88" height="58" rx="8" />
    <path d="M40 132 H160" />
    <path d="M60 132 L74 118 H126 L140 132" />
  `),
  mouse: createSvg(`
    <path d="M100 54 Q126 54 136 78 Q144 98 136 118 Q126 146 100 146 Q74 146 64 118 Q56 98 64 78 Q74 54 100 54 Z" />
    <path d="M100 54 V88" />
    <path d="M92 78 H108" />
  `),
  rocket: createSvg(`
    <path d="M100 38 Q132 66 128 106 Q124 132 100 154 Q76 132 72 106 Q68 66 100 38 Z" />
    <circle cx="100" cy="86" r="10" />
    <path d="M72 106 L52 126 L72 126" />
    <path d="M128 106 L148 126 L128 126" />
    <path d="M88 154 L78 176" />
    <path d="M112 154 L122 176" />
  `),
};

export function sanitizeSvg(svg: string) {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .trim();
}

export function getFallbackSvg(answer: string) {
  return fallbackTemplates[answer] ?? fallbackTemplates.robot;
}
