#!/usr/bin/env python3
"""
CloudForge — AI Log Summarizer
===============================
Reads deployment/build logs and uses Google Gemini (free tier)
to generate a plain-English summary with anomaly detection.

USAGE:
  python ai-summarizer.py                        # Summarize latest deployment
  python ai-summarizer.py --type build            # Summarize latest build
  python ai-summarizer.py --id <deployment-id>    # Summarize specific item

REQUIREMENTS:
  pip install requests python-dotenv

API KEY:
  Get a free Gemini API key from https://aistudio.google.com
  Set it as GEMINI_API_KEY in your .env file

INTERVIEW POINT:
  "I built an AI-powered log analyzer that reads raw CI/CD logs
   and uses Google's Gemini API to produce plain-English summaries
   and flag anomalies — making it easy for anyone on the team to
   understand what happened in a deployment without reading logs."
"""

import json
import os
import sys
import argparse
import requests
from datetime import datetime

# ---------- Configuration ----------

API_BASE = os.environ.get("CLOUDFORGE_API_URL", "http://localhost:3000/api")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"


def get_latest(ref_type="deployment"):
    """Fetch the latest build or deployment from the CloudForge API."""
    endpoint = "builds" if ref_type == "build" else "deployments"
    try:
        resp = requests.get(f"{API_BASE}/{endpoint}?limit=1", timeout=10)
        resp.raise_for_status()
        items = resp.json()
        if not items:
            print(f"No {ref_type}s found.")
            sys.exit(1)
        return items[0]
    except requests.RequestException as e:
        print(f"Error fetching {ref_type}: {e}")
        sys.exit(1)


def get_logs(ref_id, ref_type="deployment"):
    """Fetch logs for a specific build or deployment."""
    try:
        resp = requests.get(f"{API_BASE}/logs/{ref_type}/{ref_id}", timeout=10)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        print(f"Error fetching logs: {e}")
        return []


def summarize_with_gemini(log_text, ref_type, item_info):
    """Send logs to Gemini API and get a plain-English summary."""
    if not GEMINI_API_KEY:
        return generate_local_summary(log_text, ref_type, item_info)

    prompt = f"""You are a DevOps engineer analyzing CI/CD pipeline logs.
Analyze the following {ref_type} logs and provide:

1. **Status Summary** — What happened in 1-2 sentences.
2. **Key Events** — List the important steps that occurred.
3. **Duration** — How long did it take?
4. **Issues Found** — Any errors, warnings, or anomalies. Say "None" if clean.
5. **Recommendation** — Any action items or suggestions.

Context:
- Type: {ref_type}
- Status: {item_info.get('status', 'unknown')}
- Commit: {item_info.get('commit_sha', 'unknown')}
- Time: {item_info.get('created_at', 'unknown')}

Logs:
```
{log_text}
```

Keep your response concise and professional. Use plain English that a junior developer could understand."""

    try:
        resp = requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.3,
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        error_msg = f"Gemini API error: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_msg += f"\nResponse: {e.response.text}"
        print(error_msg)
        return error_msg


def generate_local_summary(log_text, ref_type, item_info):
    """Fallback: generate a summary without AI when API key isn't set."""
    status = item_info.get("status", "unknown")
    commit = item_info.get("commit_sha", "unknown")
    duration = item_info.get("duration_ms", 0)

    lines = log_text.strip().split("\n")
    error_lines = [l for l in lines if "error" in l.lower() or "fail" in l.lower()]
    warn_lines = [l for l in lines if "warn" in l.lower()]

    summary = f"""📋 {ref_type.capitalize()} Summary (Local Analysis)

Status: {"✅ " + status.capitalize() if status in ("passed", "deployed") else "❌ " + status.capitalize()}
Commit: {commit}
Duration: {duration / 1000:.1f}s
Log Lines: {len(lines)}
Errors: {len(error_lines)}
Warnings: {len(warn_lines)}

--- Key Events ---
{chr(10).join('→ ' + l.strip() for l in lines[:8])}

--- Issues ---
{chr(10).join('⚠ ' + l.strip() for l in error_lines) if error_lines else '✅ No issues detected.'}

💡 Set GEMINI_API_KEY in .env for AI-powered analysis."""

    return summary


def save_summary(ref_id, ref_type, summary_text):
    """Save the summary back to the CloudForge API."""
    try:
        resp = requests.post(
            f"{API_BASE}/summaries",
            json={
                "ref_id": ref_id,
                "ref_type": ref_type,
                "summary": summary_text,
                "model": "gemini" if GEMINI_API_KEY else "local",
            },
            timeout=10,
        )
        if resp.status_code == 201:
            print("Summary saved to CloudForge API.")
    except requests.RequestException:
        pass  # Not critical if save fails


def main():
    parser = argparse.ArgumentParser(description="CloudForge AI Log Summarizer")
    parser.add_argument(
        "--type",
        choices=["build", "deployment"],
        default="deployment",
        help="Type of log to summarize (default: deployment)",
    )
    parser.add_argument(
        "--id",
        type=str,
        default=None,
        help="Specific build/deployment ID to summarize",
    )
    args = parser.parse_args()

    # Load .env if python-dotenv is available
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
        global GEMINI_API_KEY
        GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", GEMINI_API_KEY)
    except ImportError:
        pass

    print(f"\n{'='*50}")
    print(f"  CloudForge AI Log Summarizer")
    print(f"  Mode: {'Gemini AI' if GEMINI_API_KEY else 'Local Analysis'}")
    print(f"  Type: {args.type}")
    print(f"  Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}\n")

    # Fetch item
    if args.id:
        item = {"id": args.id}
    else:
        item = get_latest(args.type)
        print(f"Latest {args.type}: {item.get('id', 'unknown')[:8]}...")

    # Fetch logs
    logs = get_logs(item["id"], args.type)
    if not logs:
        print(f"No logs found for {args.type} {item['id'][:8]}.")
        sys.exit(0)

    log_text = "\n".join(log.get("content", "") for log in logs)
    print(f"Found {len(logs)} log entries ({len(log_text)} chars)\n")

    # Generate summary
    print("Generating summary...\n")
    summary = summarize_with_gemini(log_text, args.type, item)

    print(summary)
    print(f"\n{'='*50}\n")
    
    # Save the summary to the backend API
    save_summary(item["id"], args.type, summary)
    print(f"\n{'='*50}\n")


if __name__ == "__main__":
    main()
