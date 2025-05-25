from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from github import Github
import os
from typing import List, Dict, Any, Optional
import uvicorn
import logging
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="GitHub Actions Dashboard")

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# GitHub token will be passed as an environment variable
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
g = Github(GITHUB_TOKEN) if GITHUB_TOKEN else None

class RepoConfig(BaseModel):
    owner: str
    name: str

# In-memory storage for selected repositories
selected_repos: List[Dict[str, str]] = []

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/api/repos")
async def list_repos():
    if not g:
        raise HTTPException(status_code=401, detail="GitHub authentication not configured")
    
    try:
        repos = []
        for repo in g.get_user().get_repos():
            repos.append({
                "owner": repo.owner.login,
                "name": repo.name,
                "full_name": repo.full_name,
                "private": repo.private,
                "description": repo.description
            })
        return {"repos": repos}
    except Exception as e:
        logger.error(f"Error fetching repositories: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/repos/add")
async def add_repo(repo: RepoConfig):
    global selected_repos
    repo_id = f"{repo.owner}/{repo.name}"
    if not any(r['id'] == repo_id for r in selected_repos):
        selected_repos.append({
            "id": repo_id,
            "owner": repo.owner,
            "name": repo.name
        })
    return {"status": "success", "selected_repos": selected_repos}

@app.get("/api/workflows/{owner}/{repo}")
async def get_workflows(owner: str, repo: str):
    if not g:
        raise HTTPException(status_code=401, detail="GitHub authentication not configured")
    
    try:
        repo = g.get_repo(f"{owner}/{repo}")
        workflows = []
        for w in repo.get_workflows():
            runs = w.get_runs()
            latest_run = runs[0] if runs.totalCount > 0 else None
            workflows.append({
                "id": w.id,
                "name": w.name,
                "state": w.state,
                "path": w.path,
                "created_at": w.created_at.isoformat() if w.created_at else None,
                "updated_at": w.updated_at.isoformat() if w.updated_at else None,
                "latest_run": {
                    "id": latest_run.id,
                    "status": latest_run.status,
                    "conclusion": latest_run.conclusion,
                    "created_at": latest_run.created_at.isoformat() if latest_run else None,
                    "updated_at": latest_run.updated_at.isoformat() if latest_run else None,
                } if latest_run else None
            })
        return {"workflows": workflows}
    except Exception as e:
        logger.error(f"Error fetching workflows for {owner}/{repo}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/runs/{owner}/{repo}/{workflow_id}")
async def get_workflow_runs(owner: str, repo: str, workflow_id: str, per_page: int = 5):
    if not g:
        raise HTTPException(status_code=401, detail="GitHub authentication not configured")
    
    try:
        repo = g.get_repo(f"{owner}/{repo}")
        workflow = repo.get_workflow(workflow_id)
        runs = workflow.get_runs()[:per_page]  # Get most recent runs
        
        run_data = []
        for run in runs:
            run_data.append({
                "id": run.id,
                "run_number": run.run_number,
                "event": run.event,
                "status": run.status,
                "conclusion": run.conclusion,
                "created_at": run.created_at.isoformat(),
                "updated_at": run.updated_at.isoformat(),
                "html_url": run.html_url,
                "triggering_actor": {
                    "login": run.triggering_actor.login,
                    "avatar_url": run.triggering_actor.avatar_url
                } if run.triggering_actor else None
            })
        return {"runs": run_data}
    except Exception as e:
        logger.error(f"Error fetching workflow runs for {owner}/{repo}/{workflow_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
