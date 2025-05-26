// Main JavaScript for GitHub Actions Dashboard

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the dashboard
    initializeDashboard();
    
    // Set up auto-refresh every 30 seconds
    setInterval(loadRepositories, 30000);
    
    // Set up form submission
    const repoForm = document.getElementById('add-repo-form');
    if (repoForm) {
        repoForm.addEventListener('submit', handleAddRepo);
    }
});

async function initializeDashboard() {
    // Load repositories when the page loads
    await loadRepositories();
}

async function loadRepositories() {
    try {
        const response = await fetch('/api/repos');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const repos = data.repos || [];
        
        const container = document.getElementById('repoList');
        const noReposMessage = document.getElementById('noReposMessage');
        
        if (!container || !noReposMessage) {
            console.error('Required elements not found in the DOM');
            return;
        }
        
        if (repos.length === 0) {
            noReposMessage.textContent = 'No repositories found. Make sure your GitHub token has the correct permissions.';
            return;
        }
        
        // Clear loading state
        container.innerHTML = '';
        
        // Load each repository's workflows
        for (const repo of repos) {
            await loadWorkflows(repo.owner, repo.name, container);
        }
    } catch (error) {
        console.error('Error loading repositories:', error);
        showError('Failed to load repositories. Please try again later.');
    }
}

async function loadWorkflows(owner, repo, container) {
    try {
        const repoElement = document.createElement('div');
        repoElement.className = 'repo-card';
        repoElement.id = `repo-${owner}-${repo}`;
        repoElement.innerHTML = `
            <div class="repo-header">
                <h3 class="repo-name">${owner}/${repo}</h3>
                <span class="spinner"></span>
            </div>
            <div class="workflow-list" id="workflows-${owner}-${repo}">
                <p>Loading workflows...</p>
            </div>`;
        
        container.appendChild(repoElement);
        
        // Fetch workflows for this repository
        const response = await fetch(`/api/workflows/${owner}/${repo}`);
        const workflows = await response.json();
        
        const workflowList = document.getElementById(`workflows-${owner}-${repo}`);
        if (!workflowList) return;
        
        if (workflows.length === 0) {
            workflowList.innerHTML = '<p>No workflows found for this repository.</p>';
            return;
        }
        
        workflowList.innerHTML = '';
        
        // Load workflow runs for each workflow
        for (const workflow of workflows) {
            await loadWorkflowRuns(owner, repo, workflow.id, workflow.name, workflowList);
        }
        
        // Remove spinner once loaded
        const spinner = repoElement.querySelector('.spinner');
        if (spinner) {
            spinner.remove();
        }
    } catch (error) {
        console.error(`Error loading workflows for ${owner}/${repo}:`, error);
        const workflowList = document.getElementById(`workflows-${owner}-${repo}`);
        if (workflowList) {
            workflowList.innerHTML = '<p class="error">Failed to load workflows. Please try again later.</p>';
        }
    }
}

async function loadWorkflowRuns(owner, repo, workflowId, workflowName, container) {
    try {
        const response = await fetch(`/api/workflow-runs/${owner}/${repo}/${workflowId}?per_page=3`);
        const runs = await response.json();
        
        if (!runs || runs.length === 0) {
            const workflowElement = document.createElement('div');
            workflowElement.className = 'workflow-item';
            workflowElement.innerHTML = `
                <div class="workflow-header">
                    <span class="workflow-name">${workflowName}</span>
                    <span class="workflow-status">No runs</span>
                </div>`;
            container.appendChild(workflowElement);
            return;
        }
        
        // Get the most recent run
        const latestRun = runs[0];
        const status = latestRun.conclusion || latestRun.status;
        
        const workflowElement = document.createElement('div');
        workflowElement.className = `workflow-item ${status}`;
        workflowElement.innerHTML = `
            <div class="workflow-header">
                <span class="workflow-name">${workflowName}</span>
                <span class="workflow-status ${status}">${status || 'in progress'}</span>
            </div>
            <div class="workflow-details">
                <div>Branch: ${latestRun.head_branch || 'main'}</div>
                <div>Commit: ${latestRun.head_commit?.message?.split('\n')[0] || 'N/A'}</div>
                <div>Run by: ${latestRun.actor?.login || 'N/A'}</div>
                <div>Last run: ${formatDate(latestRun.created_at)}</div>
            </div>`;
        
        container.appendChild(workflowElement);
    } catch (error) {
        console.error(`Error loading workflow runs for ${owner}/${repo}/${workflowId}:`, error);
    }
}

async function handleAddRepo(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const owner = formData.get('owner');
    const repo = formData.get('repo');
    
    if (!owner || !repo) {
        showError('Please provide both owner and repository name');
        return;
    }
    
    try {
        const response = await fetch('/api/repos/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ owner, name: repo })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to add repository');
        }
        
        // Reload the repositories
        await loadRepositories();
        
        // Reset the form
        form.reset();
    } catch (error) {
        console.error('Error adding repository:', error);
        showError(error.message);
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    }).format(date);
}

function showError(message) {
    // Check if error message already exists
    let errorElement = document.getElementById('error-message');
    
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = 'error-message';
        errorElement.className = 'error-message';
        errorElement.style.color = '#d73a49';
        errorElement.style.marginTop = '10px';
        errorElement.style.padding = '10px';
        errorElement.style.borderRadius = '4px';
        errorElement.style.backgroundColor = '#ffebee';
        
        const form = document.getElementById('add-repo-form');
        if (form) {
            form.appendChild(errorElement);
        } else {
            document.body.prepend(errorElement);
        }
    }
    
    errorElement.textContent = message;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadRepositories,
        loadWorkflows,
        loadWorkflowRuns,
        formatDate
    };
}
