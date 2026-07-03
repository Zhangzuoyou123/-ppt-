# Chaoxing PPT Crawler Skill

Chaoxing PPT Crawler is a small automation project and AI skill for downloading PPT/document image pages from Chaoxing/Xuexitong course pages and generating a single PDF with section bookmarks.

It is designed for courses where the teaching materials are shown as image pages instead of directly downloadable PPT files.

## Features

- Uses a logged-in Microsoft Edge session, so it works with courses that require Chaoxing login.
- Reads the course directory and section names.
- Skips quizzes, tests, homework, extension resources, and reading-resource nodes.
- Downloads PPT/document pages rendered as images.
- Builds one total PDF with bookmarks for each section, for example `2.1 半导体基础知识`.
- Can be installed as a Codex skill, a Claude skill, or both.

## How It Works

1. Edge is started with a local DevTools debugging port.
2. You log in to Chaoxing in that Edge window.
3. The Node.js crawler reads cookies from the local DevTools protocol and uses them in memory.
4. The crawler fetches the course directory, resolves document/PPT object IDs, and downloads image pages.
5. The Python PDF builder embeds those images into one PDF and writes PDF outline/bookmark entries for every section.

The crawler does not write cookies to disk.

## Repository Layout

```text
.
├── README.md
├── package.json
├── bin/
│   └── install.js
└── skills/
    └── chaoxing-ppt-crawler/
        ├── SKILL.md
        ├── agents/
        │   └── openai.yaml
        └── scripts/
            ├── crawl_chaoxing_courseware.js
            └── build_bookmarked_pdf.py
```

The actual AI skill is `skills/chaoxing-ppt-crawler`.

## Requirements

- Windows
- Microsoft Edge
- Node.js 22 or newer
- Python 3.10 or newer

No npm or pip package dependencies are required.

## Install as a Skill

### Option A: npx installer

Install to both Codex and Claude skill directories:

```powershell
npx github:Zhangzuoyou123/-ppt- --all
```

Install to Codex only:

```powershell
npx github:Zhangzuoyou123/-ppt- --codex
```

Install to Claude only:

```powershell
npx github:Zhangzuoyou123/-ppt- --claude
```

Install to a custom directory:

```powershell
npx github:Zhangzuoyou123/-ppt- --dest "D:\my-skills"
```

Default target directories:

- Codex: `%USERPROFILE%\.codex\skills`
- Claude: `%USERPROFILE%\.claude\skills`

The installer also honors:

- `CODEX_HOME`: installs Codex skills under `%CODEX_HOME%\skills`
- `CLAUDE_SKILLS_DIR`: installs Claude skills directly into that directory

### Option B: manual install

Clone the repo and copy the skill folder:

```powershell
git clone https://github.com/Zhangzuoyou123/-ppt-.git
Copy-Item -Recurse -Force ".\-ppt-\skills\chaoxing-ppt-crawler" "$env:USERPROFILE\.codex\skills\chaoxing-ppt-crawler"
```

For Claude:

```powershell
Copy-Item -Recurse -Force ".\-ppt-\skills\chaoxing-ppt-crawler" "$env:USERPROFILE\.claude\skills\chaoxing-ppt-crawler"
```

### Option C: Claude skill add

Some Claude skill managers support installing directly from a GitHub URL, for example:

```powershell
claude skill add https://github.com/Zhangzuoyou123/-ppt-
```

If your Claude installer expects a repository root containing `SKILL.md`, use the npx or manual install methods above instead. This repository stores the skill under `skills/chaoxing-ppt-crawler` so the outer README can stay human-facing.

## Manual Tool Usage

You can also run the scripts directly without an AI agent.

1. Start Edge with a temporary debug profile:

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path (Get-Location).Path "edge_chaoxing_profile"
Start-Process -FilePath $edge -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$profile",
  "--no-first-run",
  "--new-window",
  "<COURSE_URL>"
)
```

2. Log in to Chaoxing in that Edge window and keep it open.

3. Download courseware image pages:

```powershell
node .\skills\chaoxing-ppt-crawler\scripts\crawl_chaoxing_courseware.js `
  --url "<COURSE_URL>" `
  --out ".\chaoxing_courseware"
```

4. Build the total bookmarked PDF:

```powershell
python .\skills\chaoxing-ppt-crawler\scripts\build_bookmarked_pdf.py `
  --manifest ".\chaoxing_courseware\manifest.json" `
  --out ".\chaoxing_courseware\全章节_课件_带小节书签.pdf"
```

## Output

```text
chaoxing_courseware/
├── manifest.json
├── images/
│   └── <section>/
│       ├── 001.png
│       ├── 002.png
│       └── ...
└── 全章节_课件_带小节书签.pdf
```

`manifest.json` records section titles, image paths, object IDs, and skipped nodes.

## Filtering Rules

The crawler skips sections whose titles contain:

- Chinese: `测验`, `测试`, `考试`, `作业`, `拓展`, `扩展`, `资源`, `阅读`
- English: `quiz`, `test`, `exam`, `homework`, `extension`, `resource`, `reading`

## Notes

- PDF bookmarks are supported.
- PPTX-style navigation is different from PDF bookmarks; use PowerPoint Sections if you later generate PPTX files.
- The final PDF is image-based and does not contain selectable text unless OCR is added separately.

