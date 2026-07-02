# Chaoxing PPT Crawler

Download PPT/document image pages from a Chaoxing/Xuexitong course page and build a single bookmarked PDF.

This project is packaged as a Codex skill. It is useful when a Chaoxing course page requires browser login and the courseware is rendered as image pages instead of directly downloadable PPT files.

## What It Does

- Opens workflow support for a logged-in Edge browser session.
- Reads the Chaoxing course directory through the logged-in session.
- Skips quiz/test/homework/extension/resource/reading nodes.
- Downloads PPT/document image pages from normal courseware sections.
- Generates one total PDF with a bookmark for every section.

## Requirements

- Windows
- Microsoft Edge
- Node.js 22 or newer
- Python 3.10 or newer

No npm or pip dependencies are required.

## Quick Start

1. Start Edge with a temporary debug profile and open the course URL:

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

2. Log in to Chaoxing in that Edge window and keep the window open.

3. Download courseware images:

```powershell
node .\scripts\crawl_chaoxing_courseware.js `
  --url "<COURSE_URL>" `
  --out ".\chaoxing_courseware"
```

4. Build the total bookmarked PDF:

```powershell
python .\scripts\build_bookmarked_pdf.py `
  --manifest ".\chaoxing_courseware\manifest.json" `
  --out ".\chaoxing_courseware\全章节_课件_带小节书签.pdf"
```

## Output

```text
chaoxing_courseware/
  manifest.json
  images/
    <section>/
      001.png
      002.png
      ...
  全章节_课件_带小节书签.pdf
```

The PDF bookmark titles come from the section labels in the course directory, such as `2.1 半导体基础知识`.

## Filtering

The crawler skips nodes containing these terms:

- Chinese: `测验`, `测试`, `考试`, `作业`, `拓展`, `扩展`, `资源`, `阅读`
- English: `quiz`, `test`, `exam`, `homework`, `extension`, `resource`, `reading`

## Security Notes

- The crawler reads Chaoxing cookies from the debug Edge session through the local DevTools protocol.
- Cookies are used in memory only and are not written to disk by the script.
- Use a temporary Edge profile for crawling.

## Codex Skill Usage

Install this folder under:

```text
C:\Users\<you>\.codex\skills\chaoxing-ppt-crawler
```

Then ask Codex:

```text
Use chaoxing-ppt-crawler to download all PPT images from this Chaoxing course URL and generate one bookmarked PDF.
```

