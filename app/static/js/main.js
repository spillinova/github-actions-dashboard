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

async function loadWorkflows(owner, repo, container) {
    try {
        console.log(`Loading workflows for ${owner}/${repo}`);
        
        // If no container is provided, try to find the main container
        if (!container) {
            container = document.getElementById('repo-container');
            if (!container) {
                console.error('Main container not found');
                return;
            }
        }
        
        // Create a unique ID for this repository's workflow container
        const workflowContainerId = `workflows-${owner}-${repo}`;
        const repoCardId = `repo-${owner}-${repo}`;
        
        // Check if we already have a workflow container for this repo
        let workflowContainer = document.getElementById(workflowContainerId);
        let repoCard = document.getElementById(repoCardId);
        
        // Create a new card if it doesn't exist
        if (!repoCard) {
            repoCard = document.createElement('div');
            repoCard.className = 'card mb-4';
            repoCard.id = repoCardId;
            
            // Set up the card content without a spinner in the header
            repoCard.innerHTML = `
                <div class="card-header">
                    <h5 class="mb-0">${owner}/${repo}</h5>
                </div>
                <div class="card-body">
                    <div id="${workflowContainerId}" class="workflow-list">
                        Loading workflows...
                    </div>
                </div>
            `;
            
            // Add the card to the container
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
        
        // The updateWorkflowContainer function now handles the UI updates
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
        if (!container || !container.isConnected) {
            console.log(`Container not available for ${owner}/${repo}/${workflowId}`);
            return;
        }

        console.log(`Loading runs for workflow: ${workflowName} (${workflowId})`);
        let response;
        let data;
        
        try {
            response = await fetch(`/api/runs/${owner}/${repo}/${workflowId}?per_page=3`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`HTTP error! status: ${response.status}, response:`, errorText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            data = await response.json();
        } catch (error) {
            console.error(`Error fetching runs for ${workflowName}:`, error);
            // If we can't get the runs, show an error but don't break the UI
            updateWorkflowErrorUI(workflowId, workflowName, container, 'Failed to load workflow runs');
            return;
        }
        
        console.log(`Received data for ${workflowName}:`, data);
        
        const runs = Array.isArray(data.runs) ? data.runs : [];
        console.log(`Found ${runs.length} runs for ${workflowName}`);
        
        // Get or create workflow element
        let workflowElement = document.getElementById(`workflow-${workflowId}`);
        
        if (!workflowElement) {
            workflowElement = document.createElement('div');
            workflowElement.className = 'workflow mb-3';
            workflowElement.id = `workflow-${workflowId}`;
            // Only append if we're creating a new element
            container.appendChild(workflowElement);
        }
        
        if (runs.length === 0) {
            console.log(`No runs found for workflow: ${workflowName}`);
            workflowElement.innerHTML = `
                <div class="workflow-header">
                    <span class="workflow-name">${workflowName}</span>
                    <span class="workflow-status">No runs</span>
                </div>`;
            return;
        }
        
        // Sort runs by creation date (newest first)
        const sortedRuns = [...runs].sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
            const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
            return dateB - dateA;
        });
        
        // Use the latest run with fallbacks for missing data
        const latestRun = sortedRuns[0] || {};
        const status = latestRun.conclusion || latestRun.status || 'unknown';
        const runNumber = latestRun.run_number || '?';
        const branch = latestRun.head_branch || 'unknown';
        const commitMsg = latestRun.head_commit?.message || 'No commit message';
        const commitAuthor = latestRun.head_commit?.author?.name || 'Unknown';
        const commitDate = latestRun.head_commit?.timestamp || latestRun.created_at;
        const runUrl = latestRun.html_url || `https://github.com/${owner}/${repo}/actions`;
        
        // Format the commit message (first line only)
        const shortCommitMsg = commitMsg.split('\n')[0];
        const formattedDate = commitDate ? formatDate(commitDate) : 'Unknown date';
        
        // Only update the content if it's different to avoid flickering
        const newContent = `
            <div class="workflow-header" data-bs-toggle="collapse" data-bs-target="#runs-${workflowId}" aria-expanded="false" aria-controls="runs-${workflowId}">
                <span class="workflow-name">${workflowName}</span>
                <span class="badge bg-${getStatusBadgeClass(status)}">${status}</span>
            </div>
            <div class="collapse show" id="runs-${workflowId}">
                <div class="runs-list">
                    <div class="run-item">
                        <div class="run-header">
                            <span class="run-status ${status}"></span>
                            <a href="${runUrl}" target="_blank" class="run-number">#${runNumber}</a>
                            <span class="run-branch">${branch}</span>
                            <a href="${runUrl}" target="_blank" class="run-link ms-2" title="View run in GitHub">
                                <i class="bi-box-arrow-up-right"></i>
                            </a>
                        </div>
                        <div class="run-details">
                            <div class="commit-message" title="${commitMsg.replace(/"/g, '&quot;')}">${shortCommitMsg}</div>
                            <div class="commit-meta">
                                <span class="commit-author">
                                    <i class="bi-person-fill"></i> ${commitAuthor}
                                </span>
                                <span class="commit-date">
                                    <i class="bi-clock"></i> ${formattedDate}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
            
        // Only update if content has changed
        if (workflowElement.innerHTML.trim() !== newContent.trim()) {
            workflowElement.innerHTML = newContent;
        }
        
        // Only append if not already in the container
        if (!container.contains(workflowElement)) {
            container.appendChild(workflowElement);
        }
    } catch (error) {
        console.error(`Error loading runs for workflow ${workflowName}:`, error);
        
        // Create or update error element
        const errorId = `error-${workflowId}`;
        let errorElement = document.getElementById(errorId);
        
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = errorId;
            errorElement.className = 'alert alert-warning';
            
            // Append or replace existing content
            const existingElement = document.getElementById(`workflow-${workflowId}`);
            if (existingElement) {
                existingElement.innerHTML = '';
                existingElement.appendChild(errorElement);
            } else {
                container.appendChild(errorElement);
            }
        }
        
        errorElement.textContent = `Failed to load runs for ${workflowName}. ${error.message || ''}`;
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

// Update the workflow container with the workflows data
function updateWorkflowContainer(containerId, owner, repo, workflows) {
    const workflowContainer = document.getElementById(containerId);
    if (!workflowContainer) {
        console.error(`Workflow container ${containerId} not found`);
        return;
    }
    
    if (workflows.length === 0) {
        workflowContainer.innerHTML = '<p class="text-muted">No workflows found for this repository.</p>';
        return;
    }
    
    // Clear existing content but keep the container
    workflowContainer.innerHTML = '';
    
    // Create a list group for the workflows
    const listGroup = document.createElement('div');
    listGroup.className = 'list-group list-group-flush';
    
    // Add each workflow to the list
    workflows.forEach(workflow => {
        if (!workflow || !workflow.id || !workflow.name) return;
        
        const workflowItem = document.createElement('div');
        workflowItem.className = 'list-group-item';
        workflowItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <h6 class="mb-1">${workflow.name || 'Unnamed Workflow'}</h6>
                    <small class="text-muted">ID: ${workflow.id}</small>
                </div>
                <div class="spinner-border spinner-border-sm text-secondary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;
        
        listGroup.appendChild(workflowItem);
        
        // Load workflow runs for this workflow
        loadWorkflowRuns(owner, repo, workflow.id, workflow.name, workflowItem);
    });
    
    workflowContainer.appendChild(listGroup);
}

// Helper function to get badge class based on status
function getStatusBadgeClass(status) {
    switch (status) {
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
        default:
            return 'info';
    }
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

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (isInitialized) return;
    isInitialized = true;
    
    // Initialize the dashboard
    if (typeof initializeDashboard === 'function') {
        initializeDashboard();
    }
    
    // Set up refresh button with debounce
    const refreshBtn = document.getElementById('refreshRepos');
    if (refreshBtn && !refreshBtn.hasAttribute('data-listener-added')) {
        refreshBtn.setAttribute('data-listener-added', 'true');
        refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            refreshAllWorkflows(true);
        });
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
        document.querySelector('main').prepend(successAlert);
        
        // Auto-hide the alert after 5 seconds
        setTimeout(() => {
            const alert = bootstrap.Alert.getOrCreateInstance(successAlert);
            alert.close();
        }, 5000);
        
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
