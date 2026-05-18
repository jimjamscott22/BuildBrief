import json

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join(c*2 for c in hex_str)
    return ' '.join(str(int(hex_str[i:i+2], 16)) for i in (0, 2, 4))

themes = {
    'github-dark': {
        'ink-950': '#0d1117',
        'ink-900': '#161b22',
        'ink-800': '#21262d',
        'ink-700': '#30363d',
        'ink-600': '#484f58',
        'ink-500': '#6e7681',
        'ink-400': '#8b949e',
        'paper': '#c9d1d9',
        'paper-dim': '#8b949e',
        'paper-mute': '#6e7681',
        'cyan-200': '#a5d6ff',
        'cyan-300': '#79c0ff',
        'cyan-400': '#58a6ff',
        'cyan-500': '#388bfd',
        'cyan-600': '#1f6feb',
        'ember': '#d29922',
        'ember-dim': '#9e6a03',
        'rose': '#f85149',
        'rose-dim': '#da3633',
    },
    'dracula': {
        'ink-950': '#282a36',
        'ink-900': '#383a59',
        'ink-800': '#44475a',
        'ink-700': '#6272a4',
        'ink-600': '#8be9fd',
        'ink-500': '#f8f8f2',
        'ink-400': '#f8f8f2',
        'paper': '#f8f8f2',
        'paper-dim': '#bfbfbf',
        'paper-mute': '#6272a4',
        'cyan-200': '#d6b3ff',
        'cyan-300': '#bd93f9',
        'cyan-400': '#bd93f9',
        'cyan-500': '#9a6cf2',
        'cyan-600': '#7e4cf2',
        'ember': '#f1fa8c',
        'ember-dim': '#d1d86c',
        'rose': '#ff5555',
        'rose-dim': '#ff3333',
    },
    'nord': {
        'ink-950': '#2e3440',
        'ink-900': '#3b4252',
        'ink-800': '#434c5e',
        'ink-700': '#4c566a',
        'ink-600': '#d8dee9',
        'ink-500': '#e5e9f0',
        'ink-400': '#eceff4',
        'paper': '#eceff4',
        'paper-dim': '#d8dee9',
        'paper-mute': '#4c566a',
        'cyan-200': '#8fbcbb',
        'cyan-300': '#88c0d0',
        'cyan-400': '#81a1c1',
        'cyan-500': '#5e81ac',
        'cyan-600': '#4c6a8c',
        'ember': '#ebcb8b',
        'ember-dim': '#d08770',
        'rose': '#bf616a',
        'rose-dim': '#a14c54',
    },
    'solarized-dark': {
        'ink-950': '#002b36',
        'ink-900': '#073642',
        'ink-800': '#586e75',
        'ink-700': '#657b83',
        'ink-600': '#839496',
        'ink-500': '#93a1a1',
        'ink-400': '#eee8d5',
        'paper': '#839496',
        'paper-dim': '#586e75',
        'paper-mute': '#073642',
        'cyan-200': '#2aa198',
        'cyan-300': '#268bd2',
        'cyan-400': '#268bd2',
        'cyan-500': '#2aa198',
        'cyan-600': '#1f70a3',
        'ember': '#b58900',
        'ember-dim': '#cb4b16',
        'rose': '#dc322f',
        'rose-dim': '#c22724',
    },
    'monokai': {
        'ink-950': '#272822',
        'ink-900': '#3e3d32',
        'ink-800': '#49483e',
        'ink-700': '#75715e',
        'ink-600': '#f8f8f2',
        'ink-500': '#f8f8f2',
        'ink-400': '#f8f8f2',
        'paper': '#f8f8f2',
        'paper-dim': '#a6e22e',
        'paper-mute': '#75715e',
        'cyan-200': '#66d9ef',
        'cyan-300': '#66d9ef',
        'cyan-400': '#a6e22e',
        'cyan-500': '#fd971f',
        'cyan-600': '#e6db74',
        'ember': '#e6db74',
        'ember-dim': '#fd971f',
        'rose': '#f92672',
        'rose-dim': '#d81e5b',
    },
    'gruvbox-light': {
        'ink-950': '#fbf1c7',
        'ink-900': '#f2e5bc',
        'ink-800': '#ebdbb2',
        'ink-700': '#d5c4a1',
        'ink-600': '#bdae93',
        'ink-500': '#a89984',
        'ink-400': '#928374',
        'paper': '#3c3836',
        'paper-dim': '#504945',
        'paper-mute': '#7c6f64',
        'cyan-200': '#83a598',
        'cyan-300': '#458588',
        'cyan-400': '#d65d0e',
        'cyan-500': '#af3a03',
        'cyan-600': '#b16286',
        'ember': '#d79921',
        'ember-dim': '#b57614',
        'rose': '#cc241d',
        'rose-dim': '#9d0006',
    }
}

css = []
css.append(':root, [data-theme="default"] {\n')
default_colors = {
    'ink-950': '#07111f',
    'ink-900': '#0b1626',
    'ink-800': '#12203a',
    'ink-700': '#1b2c4a',
    'ink-600': '#2a3f63',
    'ink-500': '#4a6488',
    'ink-400': '#6b85a8',
    'paper': '#ece6d3',
    'paper-dim': '#b9b2a0',
    'paper-mute': '#7a7466',
    'cyan-200': '#bfe0ff',
    'cyan-300': '#8fcaff',
    'cyan-400': '#5fb4ff',
    'cyan-500': '#3a98ec',
    'cyan-600': '#1f7bcc',
    'ember': '#ff8a3d',
    'ember-dim': '#c66a2d',
    'rose': '#f06a6a',
    'rose-dim': '#b94f4f',
}
for k, v in default_colors.items():
    css.append(f'  --color-{k}: {hex_to_rgb(v)};\n')
css.append('}\n\n')

for theme_name, theme_colors in themes.items():
    css.append(f'[data-theme="{theme_name}"] {{\n')
    for k, v in theme_colors.items():
        css.append(f'  --color-{k}: {hex_to_rgb(v)};\n')
    css.append('}\n\n')

with open('src/index.css', 'r') as f:
    original_css = f.read()

# insert the variables after the @tailwind directives
lines = original_css.splitlines()
insert_idx = 0
for i, line in enumerate(lines):
    if line.startswith('@tailwind utilities;'):
        insert_idx = i + 1
        break

new_css = '\\n'.join(lines[:insert_idx]) + '\\n\\n' + ''.join(css) + '\\n'.join(lines[insert_idx:])

# modify the background colors in index.css body::before etc
new_css = new_css.replace('background-color: #07111f;', 'background-color: rgb(var(--color-ink-950));')
new_css = new_css.replace('rgba(95, 180, 255, 0.12)', 'rgb(var(--color-cyan-400) / 0.12)')
new_css = new_css.replace('rgba(95, 180, 255, 0.055)', 'rgb(var(--color-cyan-400) / 0.055)')
new_css = new_css.replace('rgba(95, 180, 255, 0.35)', 'rgb(var(--color-cyan-400) / 0.35)')
new_css = new_css.replace('color: #ece6d3;', 'color: rgb(var(--color-paper));')

with open('src/index.css', 'w') as f:
    f.write(new_css)
print('Done modifying index.css')
