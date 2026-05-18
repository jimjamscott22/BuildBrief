import { useState, useEffect, useRef } from 'react';

const themes = [
  {
    id: 'default',
    name: 'BuildBrief Default',
    colors: ['bg-[#07111f]', 'bg-[#5fb4ff]', 'bg-[#b9b2a0]']
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    colors: ['bg-[#0d1117]', 'bg-[#58a6ff]', 'bg-[#3fb950]']
  },
  {
    id: 'dracula',
    name: 'Dracula',
    colors: ['bg-[#282a36]', 'bg-[#bd93f9]', 'bg-[#50fa7b]']
  },
  {
    id: 'nord',
    name: 'Nord',
    colors: ['bg-[#2e3440]', 'bg-[#88c0d0]', 'bg-[#a3be8c]']
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    colors: ['bg-[#002b36]', 'bg-[#268bd2]', 'bg-[#859900]']
  },
  {
    id: 'monokai',
    name: 'Monokai',
    colors: ['bg-[#272822]', 'bg-[#f92672]', 'bg-[#a6e22e]']
  },
  {
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    colors: ['bg-[#fbf1c7]', 'bg-[#d65d0e]', 'bg-[#98971a]']
  }
];

export default function ThemePicker() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('default');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'default';
    setCurrentTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectTheme = (themeId: string) => {
    setCurrentTheme(themeId);
    localStorage.setItem('theme', themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="font-mono text-[11px] uppercase tracking-[0.22em] text-paper-dim hover:text-cyan-300 transition-colors duration-200 inline-flex items-center gap-1"
      >
        Theme
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 panel py-2 z-50 animate-fade-in shadow-xl shadow-ink-950/50">
          <div className="px-4 py-2">
            <span className="caption">THEME</span>
          </div>
          <div className="flex flex-col">
            {themes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleSelectTheme(theme.id)}
                className={`flex items-center justify-between px-4 py-2 hover:bg-ink-800 transition-colors duration-150 ${
                  currentTheme === theme.id ? 'bg-ink-800/50 text-paper' : 'text-paper-dim'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {theme.colors.map((color, idx) => (
                      <div key={idx} className={`w-3 h-3 ${color} rounded-[1px] border border-ink-700/50`} />
                    ))}
                  </div>
                  <span className="font-sans text-[13px]">{theme.name}</span>
                </div>
                {currentTheme === theme.id && (
                  <span className="text-cyan-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
