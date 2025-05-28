// Main JavaScript for GitHub Actions Dashboard

// Debounce function to limit API calls during search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Function to load the user's repositories
async function loadMyRepos() {
    console.log('loadMyRepos called');
    console.log('Document readyState:', document.readyState);
    
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) {
        console.error('searchResults container not found. Available elements with ID searchResults:', 
            document.querySelectorAll('#searchResults').length);
        return;
    }
    
    // Show loading state
    resultsContainer.innerHTML = `
        <div class="text-center p-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 mb-0">Loading your repositories...</p>
        </div>`;
    
    try {
        console.log('Making API request to /api/my-repos...');
        const response = await fetch('/api/my-repos');
        console.log('API response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', {
                status: response.status,
                statusText: response.statusText,
                response: errorText
            });
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API response data:', data);
        
        if (!data) {
            console.error('No data received from server');
            throw new Error('No data received from server');
        }
        
        const repos = Array.isArray(data.items) ? data.items : [];
        console.log(`Found ${repos.length} repositories`);
        
        if (repos.length === 0) {
            console.log('No repositories found');
            resultsContainer.innerHTML = `
                <div class="text-center p-4 text-muted">
                    <i class="bi bi-inbox" style="font-size: 2rem; opacity: 0.5;"></i>
                    <p class="mt-2 mb-0">No repositories found in your account</p>
                </div>`;
            return;
        }
        
        // If we got this far, we have valid data
        console.log('Rendering repositories');
        renderRepositories(repos, 'Your repositories');
        
    } catch (error) {
        console.error('Error in loadMyRepos:', {
            error: error,
            message: error.message,
            stack: error.stack
        });
        
        // Show error to user
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="bi bi-exclamation-triangle-fill"></i>
                    Failed to load repositories: ${error.message || 'Unknown error'}
                    <div class="mt-2 small">Check the browser console for more details.</div>
                </div>`;
        }
    }
}

// Function to render repositories in the results container
function renderRepositories(repos, title) {
    console.log('renderRepositories called with:', { title, repoCount: repos?.length });
    
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) {
        console.error('searchResults container not found in renderRepositories');
        return;
    }
    
    let html = '';
    let sortedRepos = [];
    let savedRepos = [];
    
    try {
        savedRepos = getSavedRepos();
        console.log('Saved repositories:', savedRepos);
        
        // Create header
        html = `
            <div class="sticky-top bg-white py-2 border-bottom">
                <div class="d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">${title || 'Repositories'}</h6>
                    <small class="text-muted">${Array.isArray(repos) ? repos.length : 0} repositories</small>
                </div>
            </div>`;
        
        // Handle empty or invalid repos array
        if (!Array.isArray(repos) || repos.length === 0) {
            console.log('No repositories to render');
            html += `
                <div class="text-center p-4 text-muted">
                    <i class="bi bi-inbox" style="font-size: 2rem; opacity: 0.5;"></i>
                    <p class="mt-2 mb-0">No repositories found</p>
                </div>`;
            
            resultsContainer.innerHTML = html;
            return;
        }
        
        // Sort repositories with private ones first, then by name
        sortedRepos = [...repos].sort((a, b) => {
            try {
                const aPrivate = a.private === true ? 1 : 0;
                const bPrivate = b.private === true ? 1 : 0;
                if (aPrivate !== bPrivate) {
                    return bPrivate - aPrivate; // Private repos first
                }
                return (a.name || '').localeCompare(b.name || ''); // Then sort by name
            } catch (error) {
                console.error('Error sorting repositories:', error);
                return 0;
            }
        });

        // Generate HTML for each repository
        sortedRepos.forEach(repo => {
            try {
                const isPrivate = repo.private === true;
                const ownerLogin = (repo.owner?.login || 'unknown').toString();
                const repoName = (repo.name || 'unknown').toString();
                const isAdded = savedRepos.some(r => 
                    r.owner === ownerLogin && r.name === repoName
                );
                
                // Format the updated_at date safely
                let updatedAt = 'Unknown';
                try {
                    updatedAt = repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : 'Unknown';
                } catch (e) {
                    console.warn('Invalid date format for repo:', repoName, e);
                }
                
                // Generate repository card HTML
                html += `
                    <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1 me-3">
                            <div class="d-flex align-items-center">
                                <h6 class="mb-0">
                                    ${isPrivate ? '<i class="bi bi-lock-fill text-warning me-1" title="Private repository"></i>' : ''}
                                    <a href="${repo.html_url || '#'}" target="_blank" class="text-decoration-none text-dark">
                                        ${repoName}
                                    </a>
                                    <small class="text-muted ms-2">${ownerLogin}</small>
                                </h6>
                            </div>
                            ${repo.description ? `<p class="mb-1 small text-muted text-truncate">${repo.description}</p>` : ''}
                            <div class="d-flex flex-wrap gap-2 align-items-center mt-1">
                                ${repo.language ? `<span class="badge bg-light text-dark">${repo.language}</span>` : ''}
                                <span class="badge bg-light text-dark">
                                    <i class="bi bi-star-fill text-warning"></i> ${repo.stargazers_count?.toLocaleString() || 0}
                                </span>
                                <span class="badge bg-light text-dark">
                                    <i class="bi bi-git"></i> ${repo.forks_count?.toLocaleString() || 0}
                                </span>
                                <span class="text-muted small">
                                    <i class="bi bi-clock-history"></i> Updated ${updatedAt}
                                </span>
                                ${repo.default_branch ? `
                                    <span class="badge bg-light text-dark" title="Default branch">
                                        <i class="bi bi-git-branch"></i> ${repo.default_branch}
                                    </span>` : 
                                    `<span class="badge bg-light text-dark" title="Branch information not available">
                                        <i class="bi bi-git-branch"></i> Branch: N/A
                                    </span>`
                                }
                            </div>
                        </div>
                        <button class="btn btn-sm ${isAdded ? 'btn-outline-secondary' : 'btn-primary'} add-repo" 
                                data-owner="${ownerLogin}" 
                                data-repo="${repoName}"
                                ${isAdded ? 'disabled' : ''}
                                title="${isAdded ? 'Already added' : 'Add to dashboard'}">
                            ${isAdded ? 'Added' : 'Add'}
                        </button>
                    </div>`;
            } catch (error) {
                console.error('Error rendering repository:', { repo, error });
                // Continue with next repository even if one fails
            }
        });
        
        // Update the DOM
        resultsContainer.innerHTML = html;
        
        // Add event listeners to the Add buttons
        document.querySelectorAll('.add-repo').forEach(button => {
            try {
                button.addEventListener('click', handleAddRepo);
            } catch (error) {
                console.error('Error adding event listener:', error);
            }
        });
        
    } catch (error) {
        console.error('Error in renderRepositories:', error);
        // Show error message to user
        resultsContainer.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                Failed to load repositories: ${error.message || 'Unknown error'}
                <div class="mt-2 small">Check the console for more details.</div>
            </div>`;
    }
}

// Configuration
const POLLING_INTERVAL = 60000; // 1 minute

// Global variables
let pollingIntervalId = null;
let isPolling = false;

// Track active requests to prevent duplicates
const activeRequests = new Map();

// Function to cancel pending requests for a workflow
function cancelPendingRequests(workflowId) {
    if (!workflowId) return;
    
    const request = activeRequests.get(workflowId);
    if (request) {
        const { controller, timestamp } = request;
        try {
            if (controller && !controller.signal.aborted) {
                console.log(`Cancelling previous request for workflow ${workflowId}`);
                controller.abort();
            }
        } catch (e) {
            // Ignore errors when aborting
            console.debug('Error while aborting request:', e);
        } finally {
            // Only remove if this is the same request we're trying to cancel
            const currentRequest = activeRequests.get(workflowId);
            if (currentRequest && currentRequest.timestamp === timestamp) {
                activeRequests.delete(workflowId);
            }
        }
    }
}

// Initialize polling
function startPolling() {
    // Clear any existing interval
    stopPolling();
    
    // Initial load
    refreshAllWorkflows(true);
    
    // Set up polling with error handling
    pollingIntervalId = setInterval(async () => {
        try {
            await refreshAllWorkflows(false);
        } catch (error) {
            console.error('Polling error:', error);
            // Reset on error to prevent cascading failures
            stopPolling();
            startPolling();
        }
    }, POLLING_INTERVAL);
}

// Stop polling
function stopPolling() {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
}

// Initialize the application
function initializeApp() {
    if (isInitialized) return;
    isInitialized = true;
    
    // Load repositories and start polling
    loadRepositories();
    startPolling();
    
    // Set up search functionality
    const repoSearch = document.getElementById('repoSearch');
    if (repoSearch) {
        // Remove any existing listeners to prevent duplicates
        const newRepoSearch = repoSearch.cloneNode(true);
        repoSearch.parentNode.replaceChild(newRepoSearch, repoSearch);
        
        newRepoSearch.addEventListener('input', debounce(handleRepoSearch, 500));
    }
    
    // Set up refresh button
    const refreshBtn = document.getElementById('refreshRepos');
    if (refreshBtn) {
        // Clone and replace to remove existing listeners
        const newRefreshBtn = refreshBtn.cloneNode(true);
        refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
        
        // Single click for normal refresh
        newRefreshBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await refreshAllWorkflows(true);
        });
        
        // Right-click to force refresh from GitHub
        newRefreshBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            refreshAllWorkflows(true, true);
            return false;
        });
    }
    
    // Set up modal events
    const addRepoModal = document.getElementById('addRepoModal');
    if (addRepoModal) {
        // Remove existing listeners
        const newModal = addRepoModal.cloneNode(true);
        addRepoModal.parentNode.replaceChild(newModal, addRepoModal);
        
        newModal.addEventListener('shown.bs.modal', () => {
            const searchInput = document.getElementById('repoSearch');
            if (searchInput) {
                searchInput.focus();
            }
        });
    }
    
    // Update the repositories list in the sidebar
    const savedRepos = getSavedRepos();
    updateReposList(savedRepos);
    
    // Clear any existing content in the main container
    const container = document.getElementById('repo-container');
    if (container) {
        container.innerHTML = `
            <div class="text-center p-5 text-muted">
                <i class="bi bi-github" style="font-size: 3rem; opacity: 0.2;"></i>
                <h4 class="mt-3">Select a repository to view workflows</h4>
                <p class="mt-2">Use the sidebar to select a repository or add a new one.</p>
            </div>`;
    }
}

async function loadRepositories() {
    // This function is intentionally left empty as we don't want to load all repositories
    // Repositories are only loaded when explicitly added through the UI
    return [];
}

function getSavedRepos() {
    return JSON.parse(localStorage.getItem('addedRepos') || '[]');
}

function updateReposList(repos) {
    const repoList = document.getElementById('repoList');
    const noReposMessage = document.getElementById('noReposMessage');
    const container = document.getElementById('repo-container');
    
    if (!repoList) return;
    
    // Store the currently selected repo if any
    const activeItem = repoList.querySelector('.active');
    const activeRepoId = activeItem ? activeItem.dataset.repoId : null;
    
    // Clear the current list
    repoList.innerHTML = '';
    
    if (repos.length === 0) {
        noReposMessage.style.display = 'block';
        if (container) container.innerHTML = '';
        return;
    }
    
    noReposMessage.style.display = 'none';
    
    // Add each repository to the list
    repos.forEach((repo, index) => {
        const repoId = `${repo.owner}_${repo.name}`.replace(/[^a-zA-Z0-9-_]/g, '_');
        const isActive = activeRepoId === repoId || (index === 0 && !activeRepoId);
        
        const repoItem = document.createElement('button');
        repoItem.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isActive ? 'active' : ''}`;
        repoItem.dataset.repoId = repoId;
        repoItem.dataset.owner = repo.owner;
        repoItem.dataset.repo = repo.name;
        repoItem.innerHTML = `
            <span>${repo.full_name}</span>
            <button class="btn btn-sm btn-outline-danger remove-repo" data-owner="${repo.owner}" data-repo="${repo.name}">
                <i class="bi bi-trash"></i>
            </button>
        `;
        
        // Add click handler to load workflows
        const clickHandler = async (e) => {
            // Don't navigate if the remove button was clicked
            if (e.target.closest('.remove-repo')) return;
            
            // Skip if already active
            if (repoItem.classList.contains('active')) return;
            
            // Update active state
            document.querySelectorAll('#repoList .list-group-item').forEach(item => {
                item.classList.remove('active');
            });
            repoItem.classList.add('active');
            
            // Load workflows
            if (container) {
                container.innerHTML = '';
                await loadWorkflows(repo.owner, repo.name, container);
            }
        };
        
        // Add the item to the list
        repoList.appendChild(repoItem);
        
        // Add click handler to the new item
        const addedItem = repoList.lastElementChild;
        if (addedItem) {
            addedItem.addEventListener('click', clickHandler);
            
            // Add remove button handler if it exists
            const removeBtn = addedItem.querySelector('.remove-repo');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeRepository(repo.owner, repo.name);
                });
            }
        }
        
        // If this is the active repo, load its workflows
        if (isActive && container) {
            container.innerHTML = '';
            loadWorkflows(repo.owner, repo.name, container);
        }
    });
}

function removeRepository(owner, repoName) {
    const savedRepos = getSavedRepos();
    const updatedRepos = savedRepos.filter(r => !(r.owner === owner && r.name === repoName));
    
    if (updatedRepos.length !== savedRepos.length) {
        localStorage.setItem('addedRepos', JSON.stringify(updatedRepos));
        updateReposList(updatedRepos);
        
        // If we're currently viewing this repo, clear the container
        const container = document.getElementById('repo-container');
        if (container) {
            container.innerHTML = '';
        }
    }
}

// Function to refresh all workflows for saved repositories
async function refreshAllWorkflows(forceRefresh = false, background = false) {
    console.log('Refreshing all workflows...', { forceRefresh, background });
    const savedRepos = getSavedRepos();
    const container = document.getElementById('repo-container');
    
    if (!container) {
        console.error('Main container not found');
        return;
    }
    
    // Only update UI if not a background refresh
    if (!background) {
        // Clear the container and show loading state
        container.innerHTML = `
            <div class="text-center p-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Refreshing workflows...</p>
            </div>`;
    }
    
    try {
        // Process repositories in parallel with a concurrency limit
        const BATCH_SIZE = 3; // Process 3 repositories at a time
        for (let i = 0; i < savedRepos.length; i += BATCH_SIZE) {
            const batch = savedRepos.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(repo => 
                loadWorkflows(repo.owner, repo.name, container)
                    .catch(error => {
                        console.error(`Error refreshing workflows for ${repo.owner}/${repo.name}:`, error);
                        return null; // Continue with next repository even if one fails
                    })
            ));
            // Small delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < savedRepos.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } catch (error) {
        console.error('Error in refreshAllWorkflows:', error);
        if (!background) {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle"></i>
                    Failed to refresh workflows: ${error.message}
                </div>`;
        }
    }
}

async function loadWorkflows(owner, repo, container) {
    try {
        if (!container) {
            console.error('No container provided for workflows');
            return;
        }

        // Show loading state
        container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center" style="min-height: 200px;">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span class="ms-2">Loading workflows for ${owner}/${repo}...</span>
            </div>`;

        // Check if we already have a card for this repo
        const repoId = `${owner}_${repo}`.replace(/[^a-zA-Z0-9-_]/g, '_');
        const workflowContainerId = `workflows-${repoId}`;
        let workflowContainer = document.getElementById(workflowContainerId);
        let repoCard = document.getElementById(`repo-${repoId}`);

        // If no card exists, create one
        if (!repoCard) {
            repoCard = document.createElement('div');
            repoCard.className = 'card mb-3';
            repoCard.id = `repo-${repoId}`;
            repoCard.innerHTML = `
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <a href="https://github.com/${owner}/${repo}" target="_blank" class="text-decoration-none">
                            ${owner}/${repo}
                        </a>
                    </h5>
                    <div>
                        <button class="btn btn-sm btn-outline-secondary me-2" onclick="refreshWorkflows('${owner}', '${repo}')">
                            <i class="bi-arrow-clockwise"></i> Refresh
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="removeRepository('${owner}', '${repo}')">
                            <i class="bi-trash"></i> Remove
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div id="${workflowContainerId}" class="workflow-list"></div>
                </div>`;
            
            // Clear the container and add the new card
            container.innerHTML = '';
            container.appendChild(repoCard);
            workflowContainer = document.getElementById(workflowContainerId);
            
            if (!workflowContainer) {
                console.error(`Failed to create workflow container for ${owner}/${repo}`);
                return;
            }
        } else if (!workflowContainer) {
            // If we have a card but no container, try to find or recreate it
            const cardBody = repoCard.querySelector('.card-body');
            if (cardBody) {
                workflowContainer = document.createElement('div');
                workflowContainer.id = workflowContainerId;
                workflowContainer.className = 'workflow-list';
                cardBody.innerHTML = '';
                cardBody.appendChild(workflowContainer);
            } else {
                console.error(`Card body not found for ${owner}/${repo}`);
                return;
            }
        }
        
        // Fetch workflows for this repository
        const apiUrl = `/api/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
        console.log(`Fetching workflows from: ${apiUrl}`);
        
        let response;
        try {
            response = await fetch(apiUrl);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`API Error (${response.status}) for ${owner}/${repo}:`, errorText);
                
                // Handle 404 specifically
                if (response.status === 404) {
                    throw new Error(`Repository not found or access denied: ${owner}/${repo}`);
                }
                
                throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
            }
            
            const data = await response.json();
            console.log(`Workflows data received for ${owner}/${repo}:`, data);
            const workflows = data.workflows || [];
            
            // Update the workflow container with the workflows data
            updateWorkflowContainer(workflowContainerId, owner, repo, workflows);
            
            // Load workflow runs for each workflow
            workflows.forEach(workflow => {
                loadWorkflowRuns(owner, repo, workflow.id, workflow.name, workflowContainer);
            });
            
        } catch (error) {
            console.error(`Error fetching workflows for ${owner}/${repo}:`, error);
            // Show user-friendly error
            if (workflowContainer) {
                workflowContainer.innerHTML = `
                    <div class="alert alert-warning">
                        <i class="bi bi-exclamation-triangle"></i>
                        Failed to load workflows: ${error.message}
                    </div>`;
            }
            return [];
        }
    } catch (error) {
        console.error(`Error loading workflows for ${owner}/${repo}:`, error);
        const workflowList = document.getElementById(`workflows-${owner}-${repo}`);
        if (workflowList) {
            workflowList.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle-fill"></i>
                    Failed to load workflows. Please try again later.
                    ${error.message ? `<div class="small mt-2">${error.message}</div>` : ''}
                </div>`;
        }
    }
}

// Request tracking and configuration
const REQUEST_TIMEOUT = 30000; // 30 seconds

async function loadWorkflowRuns(owner, repo, workflowId, workflowName, container) {
    if (!container || !container.isConnected) {
        console.log(`Container not available for ${owner}/${repo}/${workflowId}`);
        return;
    }

    const requestKey = `${owner}/${repo}/${workflowId}`;
    console.log(`[${new Date().toISOString()}] Loading runs for workflow: ${workflowName} (${workflowId})`);
    
    // Show loading state
    const runsContainer = container.querySelector('.workflow-runs');
    if (runsContainer) {
        runsContainer.innerHTML = `
            <div class="list-group-item text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span class="ms-2">Loading workflow runs...</span>
            </div>`;
    }
    
    let response;
    let data;
    let controller;
    
    try {
        // Create a new AbortController for this request
        controller = new AbortController();
        const requestId = `${workflowId}-${Date.now()}`; // Unique ID for this specific request
        
        // Store the active request
        activeRequests.set(workflowId, { 
            controller, 
            timestamp: Date.now(),
            id: requestId
        });
        
        // Set a timeout to clean up the request
        const timeoutId = setTimeout(() => {
            const currentRequest = activeRequests.get(workflowId);
            if (currentRequest && currentRequest.id === requestId) {
                console.log(`Request timeout for workflow ${workflowId}`);
                activeRequests.delete(workflowId);
            }
        }, REQUEST_TIMEOUT);
        
        // Clean up the timeout when the request completes
        controller.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
        });
        
        // Only fetch the most recent run with cache control
        response = await fetch(`/api/runs/${owner}/${repo}/${workflowId}?per_page=1&t=${Date.now()}`, {
            signal: controller.signal,
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        // Check if the request was aborted
        if (controller.signal.aborted) {
            console.log(`Request for ${workflowName} was aborted`);
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`HTTP error! status: ${response.status}, response:`, errorText);
            throw new Error(`Failed to load runs: ${response.status} ${response.statusText}`);
        }
        
        data = await response.json();
        
        if (!data || !Array.isArray(data.runs)) {
            throw new Error('Invalid response format from server');
        }
        
        console.log(`Received data for ${workflowName}:`, data);
        
        // Process the runs
        const runs = Array.isArray(data.runs) ? data.runs : [];
        
        if (runs.length === 0) {
            if (runsContainer) {
                runsContainer.innerHTML = `
                    <div class="list-group-item text-center py-4">
                        <i class="bi bi-inbox fs-1 text-muted mb-2"></i>
                        <p class="mb-0">No workflow runs found</p>
                        <small class="text-muted">Push a commit to trigger a workflow run</small>
                    </div>`;
            }
            return;
        }
        
        // Sort runs by creation date (newest first)
        runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // Format the runs HTML
        const runsHtml = runs.map(run => {
            const runStatus = run.conclusion || run.status || 'unknown';
            const statusClass = getStatusBadgeClass(runStatus);
            const runDate = formatDate(run.created_at);
            const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${run.id}`;
            const commitMessage = run.head_commit?.message || 'No commit message';
            const shortSha = run.head_sha ? run.head_sha.substring(0, 7) : 'N/A';
            // Try multiple possible fields for branch name
            const branch = run.head_branch || run.head_ref || run.head_repo?.default_branch || 'N/A';
            const actor = run.actor?.login || run.triggering_actor?.login || 'unknown';
            
            // Format duration
            let duration = 'N/A';
            if (run.updated_at && run.created_at) {
                const start = new Date(run.created_at);
                const end = new Date(run.updated_at);
                const diffMs = end - start;
                const diffMins = Math.floor(diffMs / 60000);
                const diffSecs = Math.floor((diffMs % 60000) / 1000);
                duration = diffMins > 0 ? `${diffMins}m ${diffSecs}s` : `${diffSecs}s`;
            }
            
            return `
                <div class="list-group-item list-group-item-action p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div class="d-flex align-items-center">
                            <span class="badge bg-${statusClass} me-2">
                                <i class="bi ${runStatus === 'success' ? 'bi-check-circle' : runStatus === 'failure' ? 'bi-x-circle' : 'bi-arrow-repeat'} me-1"></i>
                                ${runStatus.charAt(0).toUpperCase() + runStatus.slice(1)}
                            </span>
                            <a href="${runUrl}" target="_blank" class="text-decoration-none fw-bold me-2">
                                #${run.run_number}
                            </a>
                            <span class="badge bg-light text-dark border me-2">
                                <i class="bi-git me-1"></i>${branch}
                            </span>
                            <span class="badge bg-light text-dark border">
                                <i class="bi-person-fill me-1"></i>${actor}
                            </span>
                        </div>
                        <small class="text-muted" title="${new Date(run.created_at).toLocaleString()}">
                            <i class="bi-clock-history me-1"></i>${runDate}
                        </small>
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="text-truncate me-2" title="${commitMessage.replace(/"/g, '&quot;')}">
                            <i class="bi-git me-1"></i>
                            ${commitMessage.split('\n')[0]}
                        </div>
                        <div class="text-nowrap text-muted small">
                            <span class="me-2" title="Commit SHA">
                                <i class="bi-hash"></i> ${shortSha}
                            </span>
                            <span title="Duration">
                                <i class="bi-stopwatch"></i> ${duration}
                            </span>
                        </div>
                    </div>
                </div>`;
        }).join('');
        
        // Update the runs container
        if (runsContainer) {
            runsContainer.innerHTML = runsHtml;
            
            // Add click handlers for each run item
            runsContainer.querySelectorAll('.list-group-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    // Don't navigate if the click was on a link or button
                    if (e.target.tagName === 'A' || e.target.closest('a, button')) {
                        return;
                    }
                    // Toggle active class on the clicked item
                    item.classList.toggle('active');
                });
            });
        }
    } catch (error) {
        // Don't log aborted requests as errors
        if (error.name === 'AbortError') {
            console.log(`Request for ${workflowName} was aborted`);
            return;
        }
        console.error(`Error in loadWorkflowRuns for ${workflowName}:`, error);
        updateWorkflowErrorUI(workflowId, workflowName, container, `Failed to load workflow runs: ${error.message}`);
    } finally {
        // Clean up the controller if it's still active
        if (controller) {
            const currentRequest = activeRequests.get(workflowId);
            // Only delete if this is the same request we were working with
            if (currentRequest && currentRequest.controller === controller) {
                console.log(`Cleaning up request for workflow ${workflowId}`);
                activeRequests.delete(workflowId);
            }
        }
    }
}

// Helper function to update UI when workflow runs fail to load
function updateWorkflowErrorUI(workflowId, workflowName, container, errorMessage) {
    // Try to find existing workflow element
    let workflowElement = document.getElementById(`workflow-${workflowId}`);
    
    if (!workflowElement) {
        // Create a new element if it doesn't exist
        workflowElement = document.createElement('div');
        workflowElement.className = 'workflow mb-3';
        workflowElement.id = `workflow-${workflowId}`;
        container.appendChild(workflowElement);
    }
    
    // Update the element with error message
    workflowElement.innerHTML = `
        <div class="workflow-header">
            <span class="workflow-name">${workflowName}</span>
            <span class="badge bg-warning">Error</span>
        </div>
        <div class="workflow-error p-2 bg-light text-danger small">
            <i class="bi bi-exclamation-triangle-fill me-1"></i>
            ${errorMessage}
        </div>`;
}

// Helper function to get status badge class
function getStatusBadgeClass(status) {
    if (!status) return 'secondary';
    
    switch (status.toLowerCase()) {
        case 'success':
        case 'completed':
            return 'success';
        case 'failure':
        case 'failed':
        case 'error':
            return 'danger';
        case 'in_progress':
        case 'pending':
        case 'queued':
            return 'warning';
        case 'cancelled':
        case 'skipped':
            return 'secondary';
        case 'action_required':
            return 'info';
        default:
            return 'primary';
    }
}

// Update the workflow container with the workflows data
function updateWorkflowContainer(containerId, owner, repo, workflows) {
    const workflowContainer = document.getElementById(containerId);
    if (!workflowContainer) {
        console.error(`Workflow container ${containerId} not found`);
        return;
    }
    
    if (!Array.isArray(workflows) || workflows.length === 0) {
        workflowContainer.innerHTML = `
            <div class="alert alert-info">
                <i class="bi bi-info-circle"></i>
                No workflows found for this repository.
            </div>`;
        return;
    }
    
    // Clear existing content but keep the container
    workflowContainer.innerHTML = '';
    
    // Sort workflows by name
    workflows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    // Add each workflow to the container
    workflows.forEach(workflow => {
        if (!workflow || !workflow.id) return;
        
        const workflowElement = document.createElement('div');
        workflowElement.className = 'card mb-3 workflow';
        workflowElement.id = `workflow-${workflow.id}`;
        
        // Create workflow card header
        const cardHeader = document.createElement('div');
        cardHeader.className = 'card-header d-flex justify-content-between align-items-center';
        
        // Workflow title with status icon
        const titleElement = document.createElement('h6');
        titleElement.className = 'mb-0';
        titleElement.innerHTML = `
            <i class="bi bi-diagram-2 me-2"></i>
            ${workflow.name || 'Unnamed Workflow'}
        `;
        
        // Action buttons
        const actionButtons = document.createElement('div');
        
        // Add GitHub link if path is available
        if (workflow.path) {
            const githubLink = document.createElement('a');
            githubLink.href = `https://github.com/${owner}/${repo}/actions/workflows/${workflow.path.split('/').pop()}`;
            githubLink.target = '_blank';
            githubLink.className = 'btn btn-sm btn-outline-secondary me-2';
            githubLink.title = 'View on GitHub';
            githubLink.innerHTML = '<i class="bi-box-arrow-up-right"></i>';
            actionButtons.appendChild(githubLink);
        }
        
        // Add refresh button
        const refreshButton = document.createElement('button');
        refreshButton.className = 'btn btn-sm btn-outline-primary';
        refreshButton.title = 'Refresh runs';
        refreshButton.innerHTML = '<i class="bi-arrow-clockwise"></i>';
        refreshButton.onclick = () => {
            const workflowElement = document.getElementById(`workflow-${workflow.id}`);
            if (workflowElement) {
                loadWorkflowRuns(owner, repo, workflow.id, workflow.name || 'Unnamed Workflow', workflowElement);
            }
        };
        actionButtons.appendChild(refreshButton);
        
        // Assemble the card header
        cardHeader.appendChild(titleElement);
        cardHeader.appendChild(actionButtons);
        
        // Create card body for runs
        const cardBody = document.createElement('div');
        cardBody.className = 'card-body p-0';
        
        // Create runs container
        const runsContainer = document.createElement('div');
        runsContainer.className = 'workflow-runs list-group list-group-flush';
        
        // Add loading state
        runsContainer.innerHTML = `
            <div class="list-group-item text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span class="ms-2">Loading workflow runs...</span>
            </div>`;
        
        // Assemble the card
        cardBody.appendChild(runsContainer);
        workflowElement.appendChild(cardHeader);
        workflowElement.appendChild(cardBody);
        
        // Add to container
        workflowContainer.appendChild(workflowElement);
        
        // Load workflow runs
        loadWorkflowRuns(owner, repo, workflow.id, workflow.name || 'Unnamed Workflow', workflowElement);
    });
}

// Format date to a readable format
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    // Format as: MMM D, YYYY h:mm A (e.g., May 26, 2025 6:30 PM)
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// Track if initialization has been done
let isInitialized = false;

// Function to initialize search functionality
function initializeSearch() {
    // Look for both possible search input IDs and initialize the first one found
    const searchInputIds = ['repoSearch', 'searchInput'];
    let searchInput = null;
    
    for (const id of searchInputIds) {
        const element = document.getElementById(id);
        if (element && !element.hasAttribute('data-listener-added')) {
            searchInput = element;
            break;
        }
    }
    
    if (searchInput) {
        searchInput.setAttribute('data-listener-added', 'true');
        searchInput.addEventListener('input', debounce(handleRepoSearch, 300));
        
        // Focus the search input when the search modal is shown
        const searchModal = document.getElementById('searchRepoModal');
        if (searchModal) {
            searchModal.addEventListener('shown.bs.modal', () => {
                searchInput.focus();
            });
        }
    }
}

// Function to initialize refresh button
function initializeRefreshButton() {
    const refreshButton = document.getElementById('refreshRepos');
    if (refreshButton && !refreshButton.hasAttribute('data-listener-added')) {
        refreshButton.setAttribute('data-listener-added', 'true');
        refreshButton.addEventListener('click', function(e) {
            e.preventDefault();
            const currentRepos = getSavedRepos();
            updateReposList(currentRepos);
            refreshAllWorkflows(true);
        });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (isInitialized) return;
    isInitialized = true;
    
    console.log('DOM fully loaded, initializing dashboard...');
    
    // Initialize the dashboard if the function exists
    if (typeof initializeDashboard === 'function') {
        initializeDashboard();
    }
    
    // Load saved repositories
    const savedRepos = getSavedRepos();
    updateReposList(savedRepos);
    
    // Initialize UI components
    initializeRefreshButton();
    initializeSearch();
    
    // Load workflows for the first repository if available
    if (savedRepos.length > 0) {
        const container = document.getElementById('repo-container');
        if (container) {
            loadWorkflows(savedRepos[0].owner, savedRepos[0].name, container);
        }
    }
    
    // Start polling if enabled in settings
    const savedPolling = localStorage.getItem('autoRefreshEnabled');
    if (savedPolling === 'true' && typeof startPolling === 'function') {
        startPolling();
    }
    
    // Set up form submission with delegation
    const addRepoForm = document.getElementById('addRepoForm');
    if (addRepoForm && !addRepoForm.hasAttribute('data-listener-added')) {
        addRepoForm.setAttribute('data-listener-added', 'true');
        addRepoForm.addEventListener('submit', handleAddRepo);
    }
    
    // Set up search with debounce
    const searchInput = document.getElementById('searchInput');
    if (searchInput && !searchInput.hasAttribute('data-listener-added')) {
        searchInput.setAttribute('data-listener-added', 'true');
        searchInput.addEventListener('input', debounce(handleRepoSearch, 500));
    }
    
    // Use event delegation for dynamic add-repo buttons
    document.body.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.add-repo');
        if (addBtn) {
            e.preventDefault();
            handleAddRepo(e);
        }
    });
});

// Show error message in modal
function showErrorInModal(message) {
    const errorElement = document.getElementById('repoError');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('d-none');
        // Auto-hide after 5 seconds
        setTimeout(hideErrorInModal, 5000);
    }
}

// Hide error message in modal
function hideErrorInModal() {
    const errorElement = document.getElementById('repoError');
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.classList.add('d-none');
    }
}

// Handle adding a repository
async function handleAddRepo(event) {
    event.preventDefault();
    
    let owner, repoName;
    
    // Handle both button click and form submission
    if (event.target.matches('button.add-repo, .add-repo *')) {
        const button = event.target.closest('.add-repo');
        if (!button) return;
        
        owner = button.dataset.owner?.trim();
        repoName = button.dataset.repo?.trim();
    } else if (event.target.matches('form')) {
        const formData = new FormData(event.target);
        owner = formData.get('owner')?.trim();
        repoName = formData.get('repo')?.trim();
    } else {
        console.warn('Unexpected element triggered handleAddRepo:', event.target);
        return;
    }
    
    if (!owner || !repoName) {
        console.error('Missing owner or repository name');
        showErrorInModal('Missing repository information');
        return;
    }
    
    const repoFullName = `${owner}/${repoName}`;
    
    hideErrorInModal();

    // Disable form while processing
    const submitButton = event.target.closest('form')?.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

    try {
        // Verify the repository exists and we have access to it
        const response = await fetch(`/api/workflows/${owner}/${repoName}`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || 'Repository not found or access denied');
        }

        // Get or initialize the list of added repositories
        const savedRepos = getSavedRepos();

        // Check if repository is already added
        if (savedRepos.some(r => r.full_name.toLowerCase() === repoFullName.toLowerCase())) {
            throw new Error('This repository has already been added');
        }

        // Add the new repository
        const newRepo = { 
            owner: owner.toLowerCase(), 
            name: repoName.toLowerCase(), 
            full_name: repoFullName.toLowerCase()
        };

        savedRepos.push(newRepo);
        localStorage.setItem('addedRepos', JSON.stringify(savedRepos));

        // Update the repositories list
        updateReposList(savedRepos);

        // Close the modal and reset the form
        const modal = bootstrap.Modal.getInstance(document.getElementById('addRepoModal'));
        if (modal) {
            modal.hide();
        }
        form.reset();

        // Clear and update the display
        const container = document.getElementById('repo-container');
        if (container) {
            container.innerHTML = '';
            await loadWorkflows(owner, repoName, container);
        }

    } catch (error) {
        console.error('Error adding repository:', error);
        showErrorInModal(error.message || 'Failed to add repository. Please verify the repository exists and you have access to it.');
    } finally {
        // Re-enable the form
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        }
    }
}

// Function to handle repository search
async function handleRepoSearch(event) {
    const searchTerm = event.target.value.trim();
    const resultsContainer = document.getElementById('searchResults');
    
    // Show initial state if search is empty
    if (!searchTerm) {
        loadMyRepos();
        return;
    }
    
    // Show loading state
    resultsContainer.innerHTML = `
        <div class="text-center p-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 mb-0">Searching your repositories...</p>
        </div>`;
    
    try {
        // Search through the user's repositories
        const response = await fetch(`/api/my-repos?q=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const repos = data.items || [];
        
        if (repos.length === 0) {
            resultsContainer.innerHTML = `
                <div class="text-center p-4 text-muted">
                    <i class="bi bi-search" style="font-size: 2rem; opacity: 0.5;"></i>
                    <p class="mt-2 mb-0">No repositories found matching "${searchTerm}"</p>
                </div>`;
            return;
        }
        
        // Display search results
        let html = '';
        const savedRepos = getSavedRepos();
        
        repos.forEach(repo => {
            const isAdded = savedRepos.some(r => 
                r.owner === repo.owner.login && r.name === repo.name
            );
            
            html += `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1">${repo.full_name}</h6>
                        <p class="mb-1 small text-muted">${repo.description || 'No description'}</p>
                        <div class="d-flex gap-2">
                            <span class="badge bg-secondary">${repo.language || 'Unknown'}</span>
                            <span class="badge bg-light text-dark">
                                <i class="bi bi-star-fill text-warning"></i> ${repo.stargazers_count.toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <button class="btn btn-sm ${isAdded ? 'btn-outline-secondary' : 'btn-primary'} add-repo" 
                            data-owner="${repo.owner.login}" 
                            data-repo="${repo.name}"
                            ${isAdded ? 'disabled' : ''}>
                        ${isAdded ? 'Added' : 'Add'}
                    </button>
                </div>`;
        });
        
        resultsContainer.innerHTML = html;
        
        try {
            // Add event listeners to the Add buttons
            document.querySelectorAll('.add-repo').forEach(button => {
                button.addEventListener('click', handleAddRepo);
            });
        } catch (error) {
            console.error('Error rendering repositories:', {
                error,
                message: error.message,
                stack: error.stack
            });
            
            resultsContainer.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="bi bi-exclamation-triangle-fill"></i>
                    Failed to render repositories: ${error.message || 'Unknown error'}
                    <div class="mt-2 small">Check the console for more details.</div>
                </div>`;
        }
        
    } catch (error) {
        console.error('Error searching repositories:', error);
        resultsContainer.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                Failed to search repositories. Please try again later.
            </div>`;
    }
}

// Handle adding a repository
async function handleAddRepo(event) {
    event.preventDefault();
    
    let owner, repoName;
    
    // Handle both form submission and button click
    if (event.target.matches('button.add-repo')) {
        owner = event.target.dataset.owner;
        repoName = event.target.dataset.repo;
    } else if (event.target.matches('form')) {
        const formData = new FormData(event.target);
        owner = formData.get('owner');
        repoName = formData.get('repo');
    } else {
        return;
    }
    
    // Check if repository is already added
    const savedRepos = getSavedRepos();
    if (savedRepos.some(r => r.owner === owner && r.name === repoName)) {
        showErrorInModal('This repository is already added');
        return;
    }
    
    // Show loading state
    const button = event.target.matches('button') ? event.target : event.target.querySelector('button[type="submit"]');
    const originalText = button ? button.innerHTML : '';
    if (button) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';
    }
    
    try {
        // Add the repository to the list
        const newRepo = { owner, name: repoName, full_name: `${owner}/${repoName}` };
        savedRepos.push(newRepo);
        localStorage.setItem('addedRepos', JSON.stringify(savedRepos));
        
        // Update the UI
        updateReposList(savedRepos);
        
        // Close the modal if this was a form submission
        const modal = bootstrap.Modal.getInstance(document.getElementById('addRepoModal'));
        if (modal) {
            modal.hide();
        }
        
        // Reset the form
        const form = document.getElementById('addRepoForm');
        if (form) form.reset();
        
        // Show success message
        const successAlert = document.createElement('div');
        successAlert.className = 'alert alert-success alert-dismissible fade show';
        successAlert.role = 'alert';
        successAlert.innerHTML = `
            <i class="bi bi-check-circle-fill me-2"></i>
            Successfully added ${owner}/${repoName} to your dashboard.
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        // Find a suitable container for the alert
        const mainContent = document.querySelector('main, .container, .container-fluid, body');
        if (mainContent) {
            mainContent.prepend(successAlert);
            
            // Auto-hide the alert after 5 seconds
            setTimeout(() => {
                const alert = bootstrap.Alert.getOrCreateInstance(successAlert);
                alert.close();
            }, 5000);
        } else {
            console.log('Successfully added repository, but could not find a suitable container for the success message');
        }
        
    } catch (error) {
        console.error('Error adding repository:', error);
        showErrorInModal('Failed to add repository. Please try again.');
    } finally {
        // Reset button state
        if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }
}

// Set up the form submission
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('addRepoForm');
    if (form) {
        form.addEventListener('submit', handleAddRepoForm);
    }

    // Clear error when modal is hidden
    const modal = document.getElementById('addRepoModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', function() {
            hideErrorInModal();
            const form = document.getElementById('addRepoForm');
            if (form) form.reset();
        });
    }
});

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
} else {
    // Initialize the dashboard when the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM fully loaded, initializing dashboard...');
        loadMyRepos();
        
        // Add event listener for the refresh button
        const refreshButton = document.getElementById('refreshRepos');
        if (refreshButton) {
            refreshButton.addEventListener('click', loadMyRepos);
        } else {
            console.warn('Refresh button not found');
        }
        
        // Add event listener for search input
        const searchInput = document.getElementById('repoSearch');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(handleRepoSearch, 300));
        } else {
            console.warn('Search input not found');
        }
    });
}
