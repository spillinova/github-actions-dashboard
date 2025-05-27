import sys
from datetime import datetime
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

# Get the absolute path to the static and templates directories
import os
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')

# Mount static files
app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

# GitHub token will be passed as an environment variable
def get_github_client():
    token = os.getenv('GITHUB_TOKEN')
    if not token:
        logger.error("GITHUB_TOKEN environment variable is not set")
        return None
    try:
        # Create GitHub client with basic settings for compatibility
        g = Github(login_or_token=token, user_agent="GitHub-Actions-Dashboard")
        
        # Test the connection and permissions
        try:
            user = g.get_user()
            logger.info(f"Connected to GitHub as {user.login}")
            # Try to access private repos to verify permissions
            # Get first private repo (without per_page parameter for compatibility)
            try:
                for repo in user.get_repos():
                    if getattr(repo, 'private', False):
                        repo_name = getattr(repo, 'full_name', 'unknown')
                        logger.info(f"Successfully accessed private repository: {repo_name}")
                        break
            except Exception as e:
                logger.warning(f"Warning checking private repositories: {str(e)}")
                # Continue even if we can't check private repos, as the token might still work
                pass
        except Exception as e:
            logger.error(f"GitHub token permissions error: {str(e)}")
            return None
            
        return g
    except Exception as e:
        logger.error(f"Failed to initialize GitHub client: {e}")
        return None

g = get_github_client()

class RepoConfig(BaseModel):
    owner: str
    name: str

# In-memory storage for selected repositories
selected_repos: List[Dict[str, str]] = []

@app.get("/api/my-repos")
async def list_my_repos(q: str = None):
    """
    List the authenticated user's repositories, including private ones
    """
    try:
        github = get_github_client()
        if not github:
            raise HTTPException(status_code=500, detail="GitHub client not available")
        
        # Get the authenticated user
        user = github.get_user()
        logger.info(f"Fetching repositories for user: {user.login}")
        
        # Get all repositories including private ones
        # Using a generator to handle pagination manually for compatibility
        all_repos = []
        logger.info("Fetching repositories (including private ones)...")
        
        try:
            # Explicitly fetch all repositories (both public and private)
            repos = user.get_repos(affiliation='owner,collaborator,organization_member', sort='updated', direction='desc')
        except Exception as e:
            logger.error(f"Error getting repositories: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error getting repositories: {str(e)}")
        
        batch_size = 30
        batch = []
        repo_count = 0
        
        # Process repositories in batches
        for repo in repos:
            try:
                # Skip if we've reached our limit
                if repo_count >= 200:  # Increased limit to get more repositories
                    logger.info("Reached repository limit (200)")
                    break
                    
                # Add to current batch
                batch.append(repo)
                repo_count += 1
                
                # Process batch if it reaches batch size
                if len(batch) >= batch_size:
                    all_repos.extend(batch)
                    batch = []
                    logger.info(f"Fetched {repo_count} repositories so far...")
            except Exception as e:
                logger.warning(f"Error processing repository: {str(e)}")
                continue
        
        # Add any remaining repos from the last batch
        if batch:
            all_repos.extend(batch)
        
        logger.info(f"Total repositories fetched: {repo_count}")
        
        # Process repositories for output
        processed_repos = []
        
        for repo in all_repos:
            try:
                # Get repository details safely
                repo_name = getattr(repo, 'name', '')
                repo_description = getattr(repo, 'description', '')
                repo_private = getattr(repo, 'private', False)
                
                # If search term is provided, filter by it
                search_lower = q.lower() if q else ""
                if q and search_lower not in repo_name.lower() and \
                   (not repo_description or search_lower not in repo_description.lower()):
                    continue
                
                # Get owner details safely
                owner = getattr(repo, 'owner', {})
                owner_login = getattr(owner, 'login', 'unknown')
                owner_avatar = getattr(owner, 'avatar_url', '')
                
                try:
                    # Try to get the default branch with better error handling
                    default_branch = None
                    try:
                        default_branch = repo.default_branch
                        logger.info(f"Got default branch for {owner_login}/{repo_name}: {default_branch}")
                    except Exception as e:
                        logger.warning(f"Could not get default branch for {owner_login}/{repo_name}: {str(e)}")
                    
                    # Add repo to processed repos
                    processed_repos.append({
                        "id": getattr(repo, 'id', 0),
                        "name": repo_name,
                        "full_name": f"{owner_login}/{repo_name}",
                        "owner": {
                            "login": owner_login,
                            "avatar_url": owner_avatar,
                            "html_url": f"https://github.com/{owner_login}"
                        },
                        "html_url": f"https://github.com/{owner_login}/{repo_name}",
                        "description": repo_description,
                        "stargazers_count": getattr(repo, 'stargazers_count', 0),
                        "forks_count": getattr(repo, 'forks_count', 0),
                        "language": getattr(repo, 'language', None),
                        "updated_at": getattr(repo, 'updated_at', '').isoformat() if hasattr(repo, 'updated_at') else '',
                        "private": repo_private,
                        "default_branch": default_branch  # Can be None if not available
                    })
                except Exception as e:
                    logger.error(f"Error processing repository {owner_login}/{repo_name}: {str(e)}")
                    continue
                
                logger.info(f"Found repo: {owner_login}/{repo_name} (private: {repo_private})")
                
                # Limit to 200 most recent repos for better coverage
                if len(processed_repos) >= 200:
                    logger.info("Reached repository limit (200)")
                    break
                    
            except Exception as e:
                logger.warning(f"Error processing repository {getattr(repo, 'full_name', 'unknown')}: {str(e)}")
                continue
        
        logger.info(f"Returning {len(processed_repos)} repositories (filtered by search: {'yes' if q else 'no'})")
        return {"items": processed_repos}
                
    except Exception as e:
        logger.error(f"Error fetching repositories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching repositories: {str(e)}")
        
    except Exception as e:
        logger.error(f"Error searching repositories: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/repos")
async def list_repos():
    try:
        github = get_github_client()
        if not github:
            raise HTTPException(status_code=500, detail="GitHub authentication not properly configured")
            
        user = github.get_user()
        if not user:
            raise HTTPException(status_code=401, detail="Failed to authenticate with GitHub")
            
        repos = []
        for repo in user.get_repos():
            try:
                repos.append({
                    "owner": repo.owner.login,
                    "name": repo.name,
                    "full_name": repo.full_name,
                    "private": repo.private,
                    "description": repo.description
                })
            except Exception as repo_error:
                logger.warning(f"Error fetching repo {repo.name if hasattr(repo, 'name') else 'unknown'}: {repo_error}")
                continue
                
        return {"repos": repos}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in list_repos: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch repositories: {str(e)}")

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/api/repos")
async def list_repos():
    try:
        # Get a fresh GitHub client for each request
        github = get_github_client()
        if not github:
            logger.error("Failed to initialize GitHub client")
            raise HTTPException(status_code=500, detail="GitHub authentication not properly configured")
        
        user = github.get_user()
        if not user:
            raise HTTPException(status_code=401, detail="Failed to authenticate with GitHub")
            
        repos = []
        for repo in user.get_repos():
            try:
                repos.append({
                    "owner": repo.owner.login,
                    "name": repo.name,
                    "full_name": repo.full_name,
                    "private": repo.private,
                    "description": repo.description
                })
            except Exception as repo_error:
                logger.warning(f"Error fetching repo {repo.name if hasattr(repo, 'name') else 'unknown'}: {repo_error}")
                continue
                
        return {"repos": repos}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in list_repos: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch repositories: {str(e)}")

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
    try:
        github = get_github_client()
        if not github:
            raise HTTPException(status_code=500, detail="GitHub authentication not properly configured")
            
        repo_obj = github.get_repo(f"{owner}/{repo}")
        if not repo_obj:
            raise HTTPException(status_code=404, detail=f"Repository {owner}/{repo} not found")
            
        workflows = []
        for w in repo_obj.get_workflows():
            try:
                runs = w.get_runs()
                latest_run = runs[0] if runs.totalCount > 0 else None
                
                workflow_data = {
                    "id": w.id,
                    "name": w.name,
                    "state": w.state,
                    "path": w.path,
                    "created_at": w.created_at.isoformat() if w.created_at else None,
                    "updated_at": w.updated_at.isoformat() if w.updated_at else None,
                    "url": w.url,
                    "html_url": w.html_url,
                    "badge_url": w.badge_url,
                    "latest_run": {
                        "id": latest_run.id if latest_run else None,
                        "status": latest_run.status if latest_run else None,
                        "conclusion": latest_run.conclusion if latest_run else None,
                        "created_at": latest_run.created_at.isoformat() if latest_run and latest_run.created_at else None,
                        "updated_at": latest_run.updated_at.isoformat() if latest_run and latest_run.updated_at else None,
                        "html_url": latest_run.html_url if latest_run else None
                    }
                }
                
                workflows.append(workflow_data)
                
            except Exception as e:
                logger.error(f"Error processing workflow {getattr(w, 'id', 'unknown')}: {str(e)}")
                continue
                
        return {"workflows": workflows}
        
    except HTTPException as he:
        logger.error(f"HTTP error in get_workflows: {str(he.detail)}")
        raise
    except Exception as e:
        error_msg = f"Failed to fetch workflows: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_workflows: {str(e)}")

@app.get("/api/runs/{owner}/{repo}/{workflow_id}")
async def get_workflow_runs(owner: str, repo: str, workflow_id: str, per_page: int = 5):
    try:
        # Get the repository
        gh = get_github_client()
        repo_obj = gh.get_repo(f"{owner}/{repo}")
        
        # Get the workflow
        try:
            workflow = repo_obj.get_workflow(workflow_id)
        except Exception as e:
            logger.error(f"Error getting workflow {workflow_id} from {owner}/{repo}: {str(e)}")
            # Return empty runs instead of failing
            return {
                "runs": [],
                "workflow": {
                    "id": workflow_id,
                    "name": f"Workflow {workflow_id}",
                    "path": "",
                    "state": "unknown",
                    "html_url": f"https://github.com/{owner}/{repo}/actions"
                }
            }
        
        logger.info(f"Fetching runs for workflow {workflow_id} in {owner}/{repo}")
        
        try:
            # Get the workflow runs with error handling
            runs = workflow.get_runs()
            total_count = runs.totalCount
            logger.info(f"Total runs found: {total_count}")
            
            # If no runs, return early with empty list
            if total_count == 0:
                return {
                    "runs": [],
                    "workflow": {
                        "id": workflow.id,
                        "name": workflow.name,
                        "path": getattr(workflow, 'path', ''),
                        "state": getattr(workflow, 'state', 'unknown'),
                        "html_url": getattr(workflow, 'html_url', f"https://github.com/{owner}/{repo}/actions")
                    }
                }
                
            # Get the most recent runs
            recent_runs = list(runs[:per_page])
            logger.info(f"Retrieved {len(recent_runs)} most recent runs")
            
            runs_data = []
            for run in recent_runs:
                try:
                    # Basic run info
                    run_id = getattr(run, 'id', 'unknown')
                    run_html_url = getattr(run, 'html_url', f"https://github.com/{owner}/{repo}/actions")
                    
                    # Safely get run attributes with error handling
                    run_data = {
                        "id": run_id,
                        "run_number": getattr(run, 'run_number', 0),
                        "event": getattr(run, 'event', 'unknown'),
                        "status": getattr(run, 'status', 'unknown'),
                        "conclusion": getattr(run, 'conclusion', 'pending'),
                        "created_at": run.created_at.isoformat() if hasattr(run, 'created_at') and run.created_at else None,
                        "updated_at": run.updated_at.isoformat() if hasattr(run, 'updated_at') and run.updated_at else None,
                        "html_url": run_html_url,
                        "head_branch": getattr(run, 'head_branch', 'unknown'),
                    }

                    # Only add head_repository if we can get valid data
                    try:
                        if hasattr(run, 'head_repository') and run.head_repository:
                            full_name = getattr(run.head_repository, 'full_name', None)
                            if full_name:
                                run_data["head_repository"] = {"full_name": full_name}
                    except Exception as e:
                        logger.warning(f"Error getting head_repository for run {run_id}: {str(e)}")

                    # Get commit message from the head_commit attribute or fall back to repository commits
                    try:
                        head_commit_data = {}
                        
                        # First try to get from head_commit attribute
                        if hasattr(run, 'head_commit') and run.head_commit:
                            if hasattr(run.head_commit, 'sha') and run.head_commit.sha:
                                head_commit_data["id"] = run.head_commit.sha
                            if hasattr(run.head_commit, 'message') and run.head_commit.message:
                                head_commit_data["message"] = run.head_commit.message
                                
                            # Add author info if available
                            if hasattr(run.head_commit, 'author') and run.head_commit.author:
                                author_data = {}
                                if hasattr(run.head_commit.author, 'name') and run.head_commit.author.name:
                                    author_data["name"] = run.head_commit.author.name
                                if hasattr(run.head_commit.author, 'email') and run.head_commit.author.email:
                                    author_data["email"] = run.head_commit.author.email
                                if author_data:
                                    head_commit_data["author"] = author_data
                        
                        # If we still don't have a commit message, try to get it from the repository commits
                        if 'message' not in head_commit_data and hasattr(run, 'head_sha') and run.head_sha:
                            try:
                                commit = repo_obj.get_commit(sha=run.head_sha)
                                if commit and commit.commit:
                                    head_commit_data["id"] = commit.sha
                                    head_commit_data["message"] = commit.commit.message
                                    if commit.commit.author:
                                        author_data = {}
                                        if commit.commit.author.name:
                                            author_data["name"] = commit.commit.author.name
                                        if commit.commit.author.email:
                                            author_data["email"] = commit.commit.author.email
                                        if author_data:
                                            head_commit_data["author"] = author_data
                            except Exception as commit_error:
                                logger.warning(f"Error getting commit details for {run.head_sha}: {str(commit_error)}")
                        
                        # If we still don't have a message, try to get it from the run's commit message
                        if 'message' not in head_commit_data and hasattr(run, 'commit') and run.commit and hasattr(run.commit, 'message'):
                            head_commit_data["message"] = run.commit.message
                        
                        if head_commit_data:
                            run_data["head_commit"] = head_commit_data
                            
                    except Exception as e:
                        logger.warning(f"Error getting commit info for run {run_id}: {str(e)}")
                        # Add debug logging for the run object
                        logger.debug(f"Run {run_id} attributes: {dir(run)}")
                        if hasattr(run, '_rawData'):
                            logger.debug(f"Run {run_id} raw data: {run._rawData}")

                    # Add actor/author info with multiple fallbacks
                    try:
                        # First try to get from actor
                        actor = None
                        if hasattr(run, 'actor') and run.actor:
                            actor = run.actor
                        elif hasattr(run, 'user') and run.user:  # Some API versions use 'user' instead of 'actor'
                            actor = run.user
                        
                        # If we have an actor, extract the details
                        if actor:
                            actor_login = getattr(actor, 'login', None) or getattr(actor, 'name', None)
                            if actor_login:
                                run_data["actor"] = {
                                    "login": actor_login,
                                    "avatar_url": getattr(actor, 'avatar_url', ''),
                                    "html_url": f"https://github.com/{actor_login}"
                                }
                        
                        # If we still don't have an actor, try to get from the commit author
                        if 'actor' not in run_data and 'head_commit' in run_data and 'author' in run_data['head_commit']:
                            author = run_data['head_commit']['author']
                            if 'name' in author and author['name']:
                                run_data["actor"] = {
                                    "login": author['name'],
                                    "name": author['name'],
                                    "html_url": f"https://github.com/search?q={author['name']}&type=users"
                                }
                        
                        # As a last resort, try to get from the raw data
                        if 'actor' not in run_data and hasattr(run, '_rawData'):
                            raw_data = run._rawData
                            if 'actor' in raw_data and raw_data['actor']:
                                actor_data = raw_data['actor']
                                actor_login = actor_data.get('login') or actor_data.get('name')
                                if actor_login:
                                    run_data["actor"] = {
                                        "login": actor_login,
                                        "avatar_url": actor_data.get('avatar_url', ''),
                                        "html_url": f"https://github.com/{actor_login}"
                                    }
                    except Exception as e:
                        logger.warning(f"Error getting actor/author info for run {run_id}: {str(e)}")
                        logger.debug(f"Run {run_id} raw actor data: {getattr(run, '_rawData', {}).get('actor')}")

                    runs_data.append(run_data)
                    
                except Exception as e:
                    logger.warning(f"Error processing workflow run {getattr(run, 'id', 'unknown')}: {str(e)}")
                    continue
                    
            return {
                "runs": runs_data,
                "workflow": {
                    "id": workflow.id,
                    "name": getattr(workflow, 'name', f"Workflow {workflow_id}"),
                    "path": getattr(workflow, 'path', ''),
                    "state": getattr(workflow, 'state', 'unknown'),
                    "created_at": workflow.created_at.isoformat() if hasattr(workflow, 'created_at') and workflow.created_at else None,
                    "updated_at": workflow.updated_at.isoformat() if hasattr(workflow, 'updated_at') and workflow.updated_at else None,
                    "url": getattr(workflow, 'url', ''),
                    "html_url": getattr(workflow, 'html_url', f"https://github.com/{owner}/{repo}/actions"),
                    "badge_url": getattr(workflow, 'badge_url', '') if hasattr(workflow, 'badge_url') else ''
                }
            }
            
        except Exception as e:
            logger.error(f"Error fetching runs for workflow {workflow_id}: {str(e)}")
            # Return empty runs with basic workflow info
            return {
                "runs": [],
                "workflow": {
                    "id": workflow.id if hasattr(workflow, 'id') else workflow_id,
                    "name": getattr(workflow, 'name', f"Workflow {workflow_id}"),
                    "path": getattr(workflow, 'path', ''),
                    "state": getattr(workflow, 'state', 'unknown'),
                    "html_url": getattr(workflow, 'html_url', f"https://github.com/{owner}/{repo}/actions")
                }
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_workflow_runs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch workflow runs: {str(e)}")

@app.get("/health")
async def health_check():
    """
    Lightweight health check endpoint.
    Returns 200 if the application is running and can respond to requests.
    """
    try:
        # Basic response with minimal processing - no datetime dependency
        response = {
            "status": "healthy",
            "app": "github-actions-dashboard",
            "version": "1.0.0",
            "system": {
                "python_version": ".".join(map(str, sys.version_info[:3])),
                "platform": sys.platform
            }
        }
        
        # Only check GitHub connection on the first health check or periodically
        # to reduce API calls
        current_time = datetime.utcnow()
        last_github_check = getattr(health_check, '_last_github_check', None)
        
        if not last_github_check or (current_time - last_github_check).total_seconds() > 300:  # 5 minutes
            try:
                github = get_github_client()
                if github:
                    # Just check rate limit as it's lightweight
                    rate_limit = github.get_rate_limit()
                    response["github"] = {
                        "authenticated": True,
                        "rate_limit": rate_limit.core.remaining,
                        "rate_limit_reset": rate_limit.core.reset.isoformat()
                    }
                    health_check._last_github_check = current_time
            except Exception as e:
                logger.debug(f"GitHub status check skipped: {str(e)}")
                response["github"] = {
                    "authenticated": False,
                    "error": str(e)[:100]  # Truncate long error messages
                }
        
        return JSONResponse(status_code=200, content=response)
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "Application error",
                "error": str(e)[:200]  # Truncate long error messages
            }
        )

@app.get("/health/full")
async def full_health_check():
    """Full health check including GitHub API connectivity"""
    try:
        # Basic app check
        github = get_github_client()
        if not github:
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "message": "GitHub client not initialized",
                    "github_connected": False
                }
            )
        
        # Test GitHub API connection
        user = github.get_user()
        return {
            "status": "healthy",
            "app": "running",
            "github_connected": True,
            "github_user": user.login,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Full health check failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "GitHub connection failed",
                "error": str(e),
                "github_connected": False
            }
        )

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
