#!/usr/bin/env python3
"""Preview or apply GrantFolio-only Codex tool scope. Requires Python 3.11+."""
import argparse
import datetime
import json
from pathlib import Path
import re
import shutil
import tomllib

ROOT = Path(__file__).resolve().parents[1]
HOME = Path.home()
CODEX = Path(__import__('os').environ.get('CODEX_HOME', str(HOME / '.codex')))
BEGIN = '# BEGIN GRANTFOLIO TOOL SCOPE'
END = '# END GRANTFOLIO TOOL SCOPE'
POLICY = '''## Project-only tools: GrantFolio (2026-11-13)

ECC, gstack and the Karpathy-inspired project workflow are authorized only for GrantFolio (repository https://github.com/stashnid/GrantFolio). Outside this project, do not invoke, proactively suggest, read or load their skills or apply their workflow. Use the tools appropriate to the unrelated task. Their downloaded files are not standing permission to use them elsewhere. The detailed routing belongs in GrantFolio's AGENTS.md, not global instructions. A later explicit user instruction may change this scope.
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='write settings and copy project skills; default is preview')
    args = parser.parse_args()
    assert (ROOT / 'AGENTS.md').is_file(), 'Run the script from the GrantFolio checkout'
    project = tomllib.loads((ROOT / '.codex/config.toml').read_text())
    assert project['plugins']['ecc@ecc']['enabled'] is True
    candidates = [HOME / '.agents/skills/gstack', HOME / 'codex-tools/gstack']
    pointer = CODEX / 'skills/gstack/.source-path'
    if pointer.is_file():
        candidates.insert(0, Path(pointer.read_text().strip()))
    source = next((p for p in candidates if (p / '.agents/skills/gstack-qa/SKILL.md').is_file()), None)
    assert source, 'Install gstack for Codex first; no generated Codex skill catalog found'
    source = source.resolve()
    paths = set(source.rglob('SKILL.md'))
    for extra in ['_gstack-command', 'connect-chrome', 'gstack-upgrade']:
        folder = HOME / '.agents/skills' / extra
        if folder.exists():
            paths.update(folder.rglob('SKILL.md'))
    skills_root = CODEX / 'skills'
    if skills_root.exists():
        for folder in skills_root.iterdir():
            if folder.name == 'gstack' and folder.is_dir():
                paths.update(folder.rglob('SKILL.md'))
            elif folder.is_symlink() and folder.resolve().is_relative_to(source):
                skill = folder / 'SKILL.md'
                if skill.is_file():
                    paths.update([skill, skill.resolve()])
    copies = [(p, ROOT / '.agents/skills' / p.name) for p in (source / '.agents/skills').iterdir()
              if p.is_dir() and (p / 'SKILL.md').is_file()]
    for original, target in copies:
        if target.exists():
            assert not target.is_symlink(), f'Existing project skill is a symlink: {target}'
            assert (target / 'SKILL.md').read_bytes() == (original / 'SKILL.md').read_bytes(), f'Preserve and review modified skill before refresh: {target}'
    config = CODEX / 'config.toml'
    old = config.read_text() if config.exists() else ''
    tomllib.loads(old)
    updated = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n?', '', old, flags=re.S)
    pattern = r'(\[plugins\."ecc@ecc"\]\s*\n\s*enabled\s*=\s*)(?:true|false)'
    updated, count = re.subn(pattern, r'\g<1>false', updated)
    assert count <= 1, 'Duplicate ECC configuration'
    if not count:
        updated += '\n[plugins."ecc@ecc"]\nenabled = false\n'
    updated = updated.rstrip() + '\n\n' + BEGIN + '\n# gstack is enabled through project-local copies only.\n'
    for path in sorted(paths, key=str):
        updated += '\n[[skills.config]]\npath = ' + json.dumps(str(path)) + '\nenabled = false\n'
    updated += '\n' + END + '\n'
    tomllib.loads(updated)
    global_agents = CODEX / 'AGENTS.md'
    instructions = global_agents.read_text() if global_agents.exists() else ''
    policy_pattern = r'^## (?:AI development tool routing|Project-only tools: GrantFolio) \(2026-11-13\).*?(?=^## |\Z)'
    instructions = re.sub(policy_pattern, '', instructions, flags=re.M | re.S).rstrip() + '\n\n' + POLICY
    print(f'ECC: disabled globally, enabled in {ROOT.name} project config')
    print(f'gstack: {len(paths)} global path exclusions; {len(copies)} project-local skill folders')
    if not args.apply:
        print('Preview only. Add --apply to save; downloaded files and hook trust remain unchanged.')
        return
    backup = CODEX / 'backups' / ('grantfolio-scope-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    backup.mkdir(parents=True)
    for path in [config, global_agents]:
        if path.exists():
            shutil.copy2(path, backup / path.name)
    for original, target in copies:
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(original, target, symlinks=True)
    assert (config.read_text() if config.exists() else '') == old, 'Config changed during setup; rerun preview'
    config.write_text(updated)
    global_agents.write_text(instructions)
    print('Saved. Restart Codex. Trust the GrantFolio project separately if prompted.')
    print('Existing non-scope settings and hook trust were preserved. Backups:', backup)


if __name__ == '__main__':
    main()
