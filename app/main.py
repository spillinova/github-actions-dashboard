import sys
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
                owner_url = getattr(owner, 'html_url', '')
                
                # Format the repository data
                repo_data = {
                    "id": getattr(repo, 'id', 0),
                    "name": repo_name,
                    "full_name": getattr(repo, 'full_name', f"{owner_login}/{repo_name}"),
                    "owner": {
                        "login": owner_login,
                        "avatar_url": owner_avatar,
                        "html_url": owner_url
                    },
                    "html_url": getattr(repo, 'html_url', f"https://github.com/{owner_login}/{repo_name}"),
                    "description": repo_description,
                    "stargazers_count": getattr(repo, 'stargazers_count', 0),
                    "forks_count": getattr(repo, 'forks_count', 0),
                    "language": getattr(repo, 'language', None),
                    "updated_at": getattr(repo, 'updated_at', '').isoformat() if hasattr(repo, 'updated_at') else '',
                    "private": repo_private
                }
                
                processed_repos.append(repo_data)
                
                # Log the first few repos for debugging
                if len(processed_repos) <= 5:
                    logger.info(f"Found repo: {repo_name} (private: {repo_private})")
                
                # Limit to 200 most recent repos for better coverage
                if len(processed_repos) >= 200:
                    logger.info("Reached repository limit (200)")
                    break
                    
            except Exception as e:
                repo_full_name = f"{getattr(repo, 'owner', '')}/{getattr(repo, 'name', 'unknown')}"
                logger.warning(f"Error processing repository {repo_full_name}: {str(e)}")
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
        raise HTTPException(status_code=500, detail=f"Failed to fetch workflows: {str(e)}")

@app.get("/api/runs/{owner}/{repo}/{workflow_id}")
async def get_workflow_runs(owner: str, repo: str, workflow_id: str, per_page: int = 5):
    try:
        github = get_github_client()
        if not github:
            raise HTTPException(status_code=500, detail="GitHub authentication not properly configured")
            
        repo_obj = github.get_repo(f"{owner}/{repo}")
        if not repo_obj:
            raise HTTPException(status_code=404, detail=f"Repository {owner}/{repo} not found")
            
        workflow = repo_obj.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found in {owner}/{repo}")
        
        runs = workflow.get_runs()[:per_page]
        
        return {
            "runs": [{
                "id": run.id,
                "run_number": run.run_number,
                "event": run.event,
                "status": run.status,
                "conclusion": run.conclusion if hasattr(run, 'conclusion') else None,
                "created_at": run.created_at.isoformat() if hasattr(run, 'created_at') else None,
                "updated_at": run.updated_at.isoformat() if hasattr(run, 'updated_at') else None,
                "html_url": run.html_url if hasattr(run, 'html_url') else None,
                "head_commit": {
                    "message": run.head_commit.message if (hasattr(run, 'head_commit') and run.head_commit) else None,
                    "author": run.head_commit.author.name if (hasattr(run, 'head_commit') and run.head_commit and hasattr(run.head_commit, 'author')) else None,
                } if hasattr(run, 'head_commit') and run.head_commit else None
            } for run in runs]
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
        # Basic response with minimal processing
        response = {
            "status": "healthy",
            "app": "github-actions-dashboard",
            "version": "1.0.0",
            "timestamp": datetime.utcnow().isoformat(),
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
