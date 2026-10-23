
from pathlib import Path
from collections import Counter
from io import BytesIO
import ast
import re
import zipfile

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title="EdgeCase AI",
    description="Source code edge-case analysis platform",
    version="1.0.0",
)

app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "static")),
    name="static",
)

SUPPORTED_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx",
    ".java", ".html", ".css",
}

MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_TOTAL_SIZE = 20 * 1024 * 1024
MAX_FILES = 100
MAX_ZIP_ENTRIES = 500


@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html_path = BASE_DIR / "templates" / "index.html"

    if not html_path.is_file():
        raise HTTPException(500, "Dashboard template not found.")

    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "EdgeCase AI backend"}


def make_finding(
    title,
    severity,
    status,
    explanation,
    recommendation,
    filename,
    line,
    evidence,
):
    return {
        "title": title,
        "severity": severity,
        "status": status,
        "explanation": explanation,
        "recommendation": recommendation,
        "filename": filename,
        "line": line,
        "evidence": evidence[:300],
    }


def analyze_python(filename, source):
    findings = []

    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return [
            make_finding(
                "Python syntax error",
                "high",
                "potentially_unhandled",
                "The file could not be parsed as valid Python. Further "
                "analysis of this file is incomplete.",
                "Review the syntax error and validate the file before "
                "relying on analysis results.",
                filename,
                exc.lineno or 1,
                (exc.msg or "Syntax error"),
            )
        ]

    lines = source.splitlines()

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) or isinstance(
            node, ast.AsyncFunctionDef
        ):
            args = list(node.args.args)
            positional = args[: max(0, len(args) - len(node.args.defaults))]
            required = [arg.arg for arg in positional if arg.arg != "self"]

            if required and not any(
                isinstance(child, ast.If) for child in ast.walk(node)
            ):
                findings.append(
                    make_finding(
                        f"Review input validation in {node.name}()",
                        "medium",
                        "manual_review",
                        "This function accepts required parameters, but no "
                        "if-condition was found in its syntax tree. This "
                        "does not prove validation is missing; validation "
                        "may occur elsewhere or through called functions.",
                        "Check boundary values, empty strings, None values, "
                        "and invalid types where applicable.",
                        filename,
                        node.lineno,
                        lines[node.lineno - 1]
                        if node.lineno <= len(lines) else node.name,
                    )
                )

        if isinstance(node, ast.Compare):
            source_line = (
                lines[node.lineno - 1]
                if hasattr(node, "lineno") and node.lineno <= len(lines)
                else ""
            )

            if any(
                isinstance(op, (ast.Lt, ast.Gt, ast.LtE, ast.GtE))
                for op in node.ops
            ):
                findings.append(
                    make_finding(
                        "Boundary condition needs testing",
                        "medium",
                        "manual_review",
                        "A comparison uses a numeric or ordered boundary. "
                        "Test values just below, exactly at, and just above "
                        "the threshold. The comparison alone is not evidence "
                        "of a defect.",
                        "Add tests for boundary values and both sides "
                        "of the comparison.",
                        filename,
                        getattr(node, "lineno", 1),
                        source_line,
                    )
                )

        if isinstance(node, ast.ExceptHandler) and node.type is None:
            findings.append(
                make_finding(
                    "Broad exception handling",
                    "medium",
                    "manual_review",
                    "A bare except clause can hide unexpected errors and "
                    "make failures difficult to diagnose.",
                    "Catch expected exception types and log or report "
                    "unexpected failures.",
                    filename,
                    node.lineno,
                    lines[node.lineno - 1]
                    if node.lineno <= len(lines) else "except:",
                )
            )

        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id == "eval":
                findings.append(
                    make_finding(
                        "Review dynamic eval() usage",
                        "high",
                        "manual_review",
                        "eval() executes dynamically interpreted Python "
                        "expressions. If input is attacker-controlled, "
                        "this may introduce code-injection risk.",
                        "Avoid eval() for untrusted data. Use a safe parser "
                        "or explicit input mapping instead.",
                        filename,
                        node.lineno,
                        lines[node.lineno - 1]
                        if node.lineno <= len(lines) else "eval(...)",
                    )
                )

    return findings


def analyze_general(filename, source):
    findings = []
    lines = source.splitlines()

    patterns = [
        (
            r"\beval\s*\(",
            "Review dynamic eval() usage",
            "high",
            "Dynamic evaluation can be unsafe when untrusted input reaches it.",
            "Avoid evaluating untrusted strings; use safe parsing.",
        ),
        (
            r"\bTODO\b|\bFIXME\b",
            "Unresolved TODO or FIXME",
            "low",
            "This source line contains a TODO or FIXME marker. It may "
            "represent unfinished work, but context is needed to confirm.",
            "Review whether the marked work affects correctness or validation.",
        ),
        (
            r"\bcatch\s*\([^)]*\)\s*\{\s*\}",
            "Empty exception handler",
            "medium",
            "An empty catch block can silently discard errors.",
            "Handle expected errors explicitly or log unexpected failures.",
        ),
        (
            r"password\s*=\s*['\"][^'\"]+['\"]",
            "Possible hardcoded password",
            "high",
            "A password-like assignment appears to contain a literal value. "
            "This pattern may be a test fixture or placeholder.",
            "Keep secrets outside source code and rotate any exposed credential.",
        ),
    ]

    for number, line in enumerate(lines, start=1):
        for pattern, title, severity, explanation, recommendation in patterns:
            if re.search(pattern, line, re.IGNORECASE):
                findings.append(
                    make_finding(
                        title,
                        severity,
                        "manual_review",
                        explanation,
                        recommendation,
                        filename,
                        number,
                        line.strip(),
                    )
                )

    return findings


def analyze_source(filename, source):
    if not source.strip():
        return []

    if Path(filename).suffix.lower() == ".py":
        return analyze_python(filename, source)

    return analyze_general(filename, source)


def build_report(files):
    findings = []

    for filename, source in files:
        findings.extend(analyze_source(filename, source))

    severity_counts = Counter(item["severity"] for item in findings)
    status_counts = Counter(item["status"] for item in findings)

    return {
        "message": "Source code inspection completed.",
        "analysis_type": "rule_based_static_analysis",
        "files_analyzed": len(files),
        "findings_count": len(findings),
        "summary": {
            "high": severity_counts.get("high", 0),
            "medium": severity_counts.get("medium", 0),
            "low": severity_counts.get("low", 0),
            "manual_review": status_counts.get("manual_review", 0),
            "potentially_unhandled": status_counts.get(
                "potentially_unhandled", 0
            ),
            "handled": status_counts.get("handled", 0),
        },
        "findings": findings,
        "limitations": [
            "This MVP uses static rules, not an LLM.",
            "Findings are potential risks and require human verification.",
            "The system does not execute source code or generated tests.",
            "A missing pattern does not prove that an edge case is handled.",
        ],
    }


def decode_source(filename, data):
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(413, f"{filename} exceeds the 5 MB file limit.")

    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            400,
            f"{filename} is not a supported UTF-8 text file.",
        )


def validate_filename(filename):
    path = Path(filename)

    if path.is_absolute() or ".." in path.parts:
        raise HTTPException(400, "Unsafe file path detected.")

    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        return False

    if any(part.startswith(".") for part in path.parts):
        return False

    if any(
        part.lower() in {
            "node_modules", ".git", ".venv", "venv",
            "__pycache__", "dist", "build",
        }
        for part in path.parts
    ):
        return False

    return True


def extract_zip(data):
    try:
        archive = zipfile.ZipFile(BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(400, "The uploaded file is not a valid ZIP archive.")

    selected = []
    total_size = 0

    with archive:
        entries = archive.infolist()

        if len(entries) > MAX_ZIP_ENTRIES:
            raise HTTPException(400, "ZIP contains too many entries.")

        for entry in entries:
            if entry.is_dir():
                continue

            if entry.flag_bits & 0x1:
                raise HTTPException(
                    400,
                    "Encrypted ZIP entries are not supported.",
                )

            if not validate_filename(entry.filename):
                continue

            if entry.file_size > MAX_FILE_SIZE:
                continue

            total_size += entry.file_size

            if total_size > MAX_TOTAL_SIZE:
                raise HTTPException(
                    413,
                    "Extracted source files exceed the 20 MB total limit.",
                )

            if entry.file_size > 0:
                ratio = entry.file_size / max(entry.compress_size, 1)
                if ratio > 200:
                    raise HTTPException(
                        400,
                        "ZIP contains a suspicious compression ratio.",
                    )

            data = archive.read(entry)

            selected.append(
                (entry.filename, decode_source(entry.filename, data))
            )

            if len(selected) > MAX_FILES:
                raise HTTPException(
                    400,
                    "ZIP contains too many supported source files.",
                )

    if not selected:
        raise HTTPException(
            400,
            "No supported source files found in the ZIP.",
        )

    return selected


async def read_uploaded_sources(uploads):
    if len(uploads) > MAX_FILES:
        raise HTTPException(400, "Too many uploaded files.")

    selected = []
    total_size = 0

    for upload in uploads:
        filename = upload.filename or ""

        if not validate_filename(filename):
            raise HTTPException(
                400,
                f"Unsupported or unsafe source filename: {filename}",
            )

        data = await upload.read(MAX_FILE_SIZE + 1)

        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(
                413,
                f"{filename} exceeds the 5 MB file limit.",
            )

        total_size += len(data)

        if total_size > MAX_TOTAL_SIZE:
            raise HTTPException(
                413,
                "Uploaded source files exceed the 20 MB total limit.",
            )

        selected.append((filename, decode_source(filename, data)))

    if not selected:
        raise HTTPException(400, "No source files were uploaded.")

    return selected


async def fetch_github_sources(url):
    import json
    import urllib.error
    import urllib.request

    match = re.fullmatch(
        r"https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/?",
        url,
    )

    if not match:
        raise HTTPException(
            400,
            "Enter a public GitHub URL like https://github.com/owner/repo.",
        )

    owner, repo = match.groups()
    api_url = (
        f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD"
        "?recursive=1"
    )

    request = urllib.request.Request(
        api_url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "EdgeCaseAI-MVP",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            tree = json.loads(response.read(5 * 1024 * 1024 + 1))

    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise HTTPException(
                404,
                "Repository not found or not publicly accessible.",
            )
        raise HTTPException(502, "GitHub returned an error.")

    except Exception:
        raise HTTPException(
            502,
            "Unable to contact GitHub. Check the repository URL and network.",
        )

    if tree.get("truncated"):
        raise HTTPException(
            400,
            "This repository is too large for the current MVP.",
        )

    files = [
        entry for entry in tree.get("tree", [])
        if entry.get("type") == "blob"
        and validate_filename(entry.get("path", ""))
    ]

    if not files:
        raise HTTPException(400, "No supported source files found.")

    selected = []
    total_size = 0

    for entry in files[:MAX_FILES]:
        if entry.get("size", 0) > MAX_FILE_SIZE:
            continue

        raw_url = (
            f"https://raw.githubusercontent.com/"
            f"{owner}/{repo}/HEAD/{entry['path']}"
        )

        request = urllib.request.Request(
            raw_url,
            headers={"User-Agent": "EdgeCaseAI-MVP"},
        )

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                data = response.read(MAX_FILE_SIZE + 1)

        except Exception:
            continue

        if len(data) > MAX_FILE_SIZE:
            continue

        total_size += len(data)

        if total_size > MAX_TOTAL_SIZE:
            break

        try:
            source = decode_source(entry["path"], data)
        except HTTPException:
            continue

        selected.append((entry["path"], source))

    if not selected:
        raise HTTPException(400, "No readable supported source files found.")

    return selected


@app.post("/api/analyze")
async def analyze_project(
    zip_file: UploadFile | None = File(default=None),
    source_files: list[UploadFile] | None = File(default=None),
    github_url: str | None = Form(default=None),
):
    methods = sum(
        [
            zip_file is not None,
            bool(source_files),
            bool(github_url and github_url.strip()),
        ]
    )

    if methods != 1:
        raise HTTPException(
            400,
            "Choose exactly one input method: ZIP, source files, or GitHub URL.",
        )

    if zip_file is not None:
        filename = zip_file.filename or ""

        if not filename.lower().endswith(".zip"):
            raise HTTPException(400, "Please upload a .zip file.")

        data = await zip_file.read(MAX_TOTAL_SIZE + 1)

        if len(data) > MAX_TOTAL_SIZE:
            raise HTTPException(413, "ZIP upload exceeds the 20 MB limit.")

        sources = extract_zip(data)

    elif source_files:
        sources = await read_uploaded_sources(source_files)

    else:
        sources = await fetch_github_sources(github_url.strip())

    return build_report(sources)

