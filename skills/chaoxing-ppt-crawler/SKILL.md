---
name: chaoxing-ppt-crawler
description: Download Chaoxing/Xuexitong course PPT or document image pages after the user logs in with Edge, then build a single PDF with section bookmarks. Use for tasks involving mooc1.chaoxing.com course URLs, Chaoxing courseware crawling, PPT image downloads, and generating a bookmarked courseware PDF while excluding quizzes/tests/extension resources.
---

# Chaoxing PPT Crawler

Use this skill to download PPT/document image pages from a Chaoxing course page and generate a single bookmarked PDF.

## Workflow

1. Start Edge with a temporary debug profile and open the user's course URL:

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

Ask the user to log in and reply when the course page is visible.

2. Run the crawler script from this skill directory:

```powershell
node .\scripts\crawl_chaoxing_courseware.js `
  --url "<COURSE_URL>" `
  --out ".\chaoxing_courseware"
```

The script connects to Edge DevTools on port 9222, reads logged-in cookies in memory, fetches the course directory, skips quiz/test/extension nodes, resolves PPT/document objects, and downloads image pages.

3. Build the total PDF with one bookmark per section:

```powershell
python .\scripts\build_bookmarked_pdf.py `
  --manifest ".\chaoxing_courseware\manifest.json" `
  --out ".\chaoxing_courseware\全章节_课件_带小节书签.pdf"
```

## Output

The crawler writes:

- `manifest.json`: course sections, page image paths, object IDs, and skipped nodes
- `images/<section>/NNN.png`: downloaded PPT/document image pages
- `全章节_课件_带小节书签.pdf`: final PDF with section bookmarks

If the user asks for PPTX too, create it separately with PowerPoint COM by inserting images in `manifest.json` order. PDF bookmarks are supported by `build_bookmarked_pdf.py`; PPTX uses PowerPoint Sections, not PDF-style bookmarks.

## Filtering Rules

Skip nodes whose section title contains quiz/test/extension indicators:

- Chinese: `测验`, `测试`, `考试`, `作业`, `拓展`, `扩展`, `资源`, `阅读`
- English: `quiz`, `test`, `exam`, `homework`, `extension`, `resource`, `reading`

Keep normal PPT/document courseware nodes only.

## Notes

- Do not print cookies to chat. The crawler reads cookies via DevTools and uses them only in memory.
- If direct network access fails in the sandbox, rerun the same command with approval/escalation.
- If Edge is already open without `--remote-debugging-port`, start a separate temporary Edge profile as shown above.
- The final PDF is image-based and does not contain selectable text unless OCR is added separately.
