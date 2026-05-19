export const tokens = {
  // Section gradient per page — single source of truth
  section: {
    home:       { gradient: 'from-violet-600 via-purple-600 to-indigo-700', nav: 'from-violet-500 to-indigo-600'  },
    investment: { gradient: 'from-blue-500 to-cyan-600',                    nav: 'from-blue-500 to-cyan-600'      },
    health:     { gradient: 'from-rose-500 to-pink-600',                    nav: 'from-rose-500 to-pink-600'      },
    finance:    { gradient: 'from-emerald-500 to-teal-600',                 nav: 'from-emerald-500 to-teal-600'   },
    retirement: { gradient: 'from-orange-500 to-amber-500',                 nav: 'from-orange-500 to-amber-500'   },
    coach:      { gradient: 'from-purple-500 to-violet-600',                nav: 'from-purple-500 to-violet-600'  },
    settings:   { gradient: 'from-slate-500 to-gray-700',                   nav: 'from-slate-500 to-gray-700'     },
  },

  // Elevation
  shadow: {
    card: 'shadow-[0_2px_16px_rgba(0,0,0,0.06)]',
    nav:  'shadow-[0_-4px_24px_rgba(0,0,0,0.07)]',
  },

  // Border radius — semantic names
  radius: {
    card:  'rounded-2xl',
    input: 'rounded-xl',
    tag:   'rounded-full',
    sheet: 'rounded-t-3xl',
    chip:  'rounded-xl',
  },

  // Modal — single overlay standard
  modal: {
    overlay: 'fixed inset-0 bg-black/50 z-50 flex items-end',
  },

  // Typography scale — 9 steps
  text: {
    labelXs: 'text-[10px]',  // micro labels, timestamps
    labelSm: 'text-[11px]',  // card labels, nav labels
    bodyXs:  'text-[12px]',  // secondary text, captions
    bodySm:  'text-[13px]',  // primary body (most common)
    body:    'text-[14px]',  // normal body, chat
    bodyLg:  'text-[15px]',  // form buttons, prominent body
    titleSm: 'text-[17px]',  // white-header page titles
    title:   'text-[22px]',  // gradient-header page titles
    hero:    'text-[28px]',  // dashboard hero name
  },
} as const
