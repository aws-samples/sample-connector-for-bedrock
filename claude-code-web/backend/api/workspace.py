"""
Workspace management endpoints.

Provides API endpoints for initializing and syncing user workspaces with S3.
"""

import logging
import os

from fastapi import APIRouter, HTTPException

from ..core.workspace_sync import (
    WorkspaceSyncError,
    clone_git_repository,
    get_workspace_info,
    list_projects_from_s3,
    sync_workspace_from_s3,
    sync_workspace_to_s3,
)
from ..models.schemas import (
    CloneGitRepositoryRequest,
    CloneGitRepositoryResponse,
    CreateProjectRequest,
    CreateProjectResponse,
    InitWorkspaceRequest,
    InitWorkspaceResponse,
    ListProjectsResponse,
    SyncWorkspaceToS3Request,
    SyncWorkspaceToS3Response,
    WorkspaceInfoResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Get S3 bucket from environment
S3_BUCKET = os.getenv("S3_WORKSPACE_BUCKET")
S3_PREFIX = os.getenv("S3_WORKSPACE_PREFIX", "user_data")
LOCAL_BASE_PATH = os.getenv("WORKSPACE_BASE_PATH", "/workspace")


@router.post("/workspace/init", response_model=InitWorkspaceResponse)
async def init_workspace(request: InitWorkspaceRequest):
    """
    Initialize a user's workspace by syncing from S3.

    Downloads the user's workspace directory from S3 to local filesystem
    using s5cmd for high-performance parallel transfers.

    Environment Variables:
    - S3_WORKSPACE_BUCKET: S3 bucket name (required)
    - S3_WORKSPACE_PREFIX: S3 key prefix (default: "user_data")
    - WORKSPACE_BASE_PATH: Local base directory (default: "/workspace")

    S3 Path Format: s3://{bucket}/{prefix}/{user_id}/{workspace_name}/
    Local Path Format: {base_path}/{user_id}/

    Args:
        request: InitWorkspaceRequest containing user_id, workspace_name, dry_run

    Returns:
        InitWorkspaceResponse with sync status and details

    Raises:
        HTTPException: If S3 bucket not configured or sync fails
    """
    if not S3_BUCKET:
        raise HTTPException(
            status_code=500,
            detail="S3_WORKSPACE_BUCKET environment variable not configured"
        )

    logger.info(f"Initializing workspace for user: {request.user_id}")

    try:
        result = await sync_workspace_from_s3(
            user_id=request.user_id,
            bucket_name=S3_BUCKET,
            local_base_path=LOCAL_BASE_PATH,
            workspace_name=request.workspace_name,
            s3_prefix=S3_PREFIX,
            dry_run=request.dry_run,
        )

        return InitWorkspaceResponse(**result)

    except WorkspaceSyncError as e:
        logger.error(f"Workspace init failed for user {request.user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error during workspace init: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Workspace initialization failed: {str(e)}")


@router.post("/workspace/sync-to-s3", response_model=SyncWorkspaceToS3Response)
async def sync_to_s3(request: SyncWorkspaceToS3Request):
    """
    Sync a user's local workspace back to S3.

    Uploads the user's local workspace directory to S3 using s5cmd
    for high-performance parallel transfers.

    Environment Variables:
    - S3_WORKSPACE_BUCKET: S3 bucket name (required)
    - S3_WORKSPACE_PREFIX: S3 key prefix (default: "user_data")
    - WORKSPACE_BASE_PATH: Local base directory (default: "/workspace")

    Args:
        request: SyncWorkspaceToS3Request containing user_id, workspace_name, dry_run

    Returns:
        SyncWorkspaceToS3Response with sync status and details

    Raises:
        HTTPException: If S3 bucket not configured or sync fails
    """
    if not S3_BUCKET:
        raise HTTPException(
            status_code=500,
            detail="S3_WORKSPACE_BUCKET environment variable not configured"
        )

    logger.info(f"Syncing workspace to S3 for user: {request.user_id}")

    try:
        result = await sync_workspace_to_s3(
            user_id=request.user_id,
            bucket_name=S3_BUCKET,
            local_base_path=LOCAL_BASE_PATH,
            workspace_name=request.workspace_name,
            s3_prefix=S3_PREFIX,
            dry_run=request.dry_run,
        )

        return SyncWorkspaceToS3Response(**result)

    except WorkspaceSyncError as e:
        logger.error(f"Workspace sync to S3 failed for user {request.user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error during workspace sync: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Workspace sync failed: {str(e)}")


@router.get("/workspace/info/{user_id}", response_model=WorkspaceInfoResponse)
async def workspace_info(user_id: str):
    """
    Get information about a user's local workspace.

    Returns details about the workspace including path, size, and file count.

    Environment Variables:
    - WORKSPACE_BASE_PATH: Local base directory (default: "/workspace")

    Args:
        user_id: User ID

    Returns:
        WorkspaceInfoResponse with workspace details
    """
    logger.info(f"Getting workspace info for user: {user_id}")

    try:
        info = get_workspace_info(user_id, LOCAL_BASE_PATH)
        return WorkspaceInfoResponse(**info)

    except Exception as e:
        logger.error(f"Error getting workspace info: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get workspace info: {str(e)}")


@router.post("/workspace/clone-git", response_model=CloneGitRepositoryResponse)
async def clone_git(request: CloneGitRepositoryRequest):
    """
    Clone a Git repository into a user's workspace using GitHub CLI.

    Downloads a Git repository to the user's workspace directory using 'gh repo clone'
    for better authentication handling. Supports GitHub URLs, org/repo format,
    branch selection, and shallow cloning.

    Environment Variables:
    - WORKSPACE_BASE_PATH: Local base directory (default: "/workspace")

    Repository Path: {base_path}/{repo_name}/

    Args:
        request: CloneGitRepositoryRequest containing user_id, git_url, and options

    Returns:
        CloneGitRepositoryResponse with clone status and repository details

    Raises:
        HTTPException: If gh CLI is not installed or clone fails
    """
    logger.info(f"Cloning repository {request.git_url} for user: {request.user_id}")

    try:
        result = await clone_git_repository(
            user_id=request.user_id,
            git_url=request.git_url,
            local_base_path=LOCAL_BASE_PATH,
            branch=request.branch,
            repo_name=request.repo_name,
            shallow=request.shallow,
        )

        return CloneGitRepositoryResponse(**result)

    except WorkspaceSyncError as e:
        logger.error(f"Git clone failed for user {request.user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error during git clone: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Git clone failed: {str(e)}")


@router.get("/workspace/projects/{user_id}", response_model=ListProjectsResponse)
async def list_projects(user_id: str):
    """
    List all projects for a user from both S3 and local filesystem.

    Returns a unified list of project names from:
    1. S3: s3://{bucket}/{prefix}/{user_id}/projects/{project_name}/
    2. Local: {base_path}/{project_name}/

    Environment Variables:
    - S3_WORKSPACE_BUCKET: S3 bucket name (required)
    - S3_WORKSPACE_PREFIX: S3 key prefix (default: "user_data")
    - WORKSPACE_BASE_PATH: Local base directory (default: "/workspace")

    Args:
        user_id: User ID

    Returns:
        ListProjectsResponse with list of project names

    Raises:
        HTTPException: If S3 bucket not configured or listing fails
    """
    if not S3_BUCKET:
        raise HTTPException(
            status_code=500,
            detail="S3_WORKSPACE_BUCKET environment variable not configured"
        )

    logger.info(f"Listing projects for user: {user_id}")

    try:
        # Get projects from S3
        s3_projects = await list_projects_from_s3(
            user_id=user_id,
            bucket_name=S3_BUCKET,
            s3_prefix=S3_PREFIX,
        )
        logger.info(f"Found {len(s3_projects)} projects in S3: {s3_projects}")

        # Get projects from local filesystem
        from pathlib import Path
        local_projects = []
        local_base = Path(LOCAL_BASE_PATH)
        if local_base.exists():
            # List directories in workspace base path (excluding hidden directories)
            local_projects = [
                d.name for d in local_base.iterdir()
                if d.is_dir() and not d.name.startswith('.')
            ]
            logger.info(f"Found {len(local_projects)} projects locally: {local_projects}")

        # Merge and deduplicate projects (S3 + local)
        all_projects = sorted(set(s3_projects + local_projects))
        logger.info(f"Total unique projects: {len(all_projects)}")

        return ListProjectsResponse(
            user_id=user_id,
            projects=all_projects,
            message=f"Found {len(all_projects)} projects ({len(s3_projects)} in S3, {len(local_projects)} local)" if all_projects else "No projects found"
        )

    except Exception as e:
        logger.error(f"Error listing projects for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list projects: {str(e)}")


@router.post("/workspace/projects", response_model=CreateProjectResponse)
async def create_project(request: CreateProjectRequest):
    """
    Create a new project for a user.

    Creates a new project directory locally and syncs to S3.
    Local path: {base_path}/{project_name}/
    S3 path: s3://{bucket}/{prefix}/{user_id}/projects/{project_name}/

    Environment Variables:
    - S3_WORKSPACE_BUCKET: S3 bucket name (required)
    - S3_WORKSPACE_PREFIX: S3 key prefix (default: "user_data")
    - WORKSPACE_BASE_PATH: Local base directory (default: "/workspace")

    Args:
        request: CreateProjectRequest containing user_id and project_name

    Returns:
        CreateProjectResponse with creation status

    Raises:
        HTTPException: If S3 bucket not configured or creation fails
    """
    if not S3_BUCKET:
        raise HTTPException(
            status_code=500,
            detail="S3_WORKSPACE_BUCKET environment variable not configured"
        )

    logger.info(f"Creating project {request.project_name} for user: {request.user_id}")

    try:
        from pathlib import Path
        from ..core.workspace_sync import backup_project_to_s3

        # Create local project directory (without user_id in path)
        local_project_path = Path(LOCAL_BASE_PATH) / request.project_name

        if local_project_path.exists():
            # Project already exists, just return success
            logger.info(f"Project {request.project_name} already exists at {local_project_path}")
            return CreateProjectResponse(
                status="success",
                user_id=request.user_id,
                project_name=request.project_name,
                local_path=str(local_project_path),
                message=f"Project {request.project_name} already exists"
            )

        local_project_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Created local project directory: {local_project_path}")

        # Create a .gitkeep file to ensure directory is not empty
        gitkeep_file = local_project_path / ".gitkeep"
        gitkeep_file.touch()

        # Backup to S3
        result = await backup_project_to_s3(
            user_id=request.user_id,
            project_name=request.project_name,
            bucket_name=S3_BUCKET,
            s3_prefix=S3_PREFIX,
            local_base_path=LOCAL_BASE_PATH,
        )

        if result["status"] != "success":
            raise HTTPException(
                status_code=500,
                detail=f"Failed to sync project to S3: {result.get('message', 'Unknown error')}"
            )

        return CreateProjectResponse(
            status="success",
            user_id=request.user_id,
            project_name=request.project_name,
            local_path=str(local_project_path),
            message=f"Project {request.project_name} created successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating project for user {request.user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")


@router.post("/workspace/projects/backup")
async def backup_project(request: CreateProjectRequest):
    """
    Backup a project from local workspace to S3.

    Syncs files from /workspace/{project_name} to S3.

    Environment Variables:
    - S3_WORKSPACE_BUCKET: S3 bucket name (required)
    - S3_WORKSPACE_PREFIX: S3 key prefix (default: "user_data")
    - WORKSPACE_BASE_PATH: Local base directory (default: "/workspace")

    Args:
        request: CreateProjectRequest containing user_id and project_name

    Returns:
        Dict with backup status, files_synced, etc.

    Raises:
        HTTPException: If S3 bucket not configured or backup fails
    """
    if not S3_BUCKET:
        raise HTTPException(
            status_code=500,
            detail="S3_WORKSPACE_BUCKET environment variable not configured"
        )

    logger.info(f"Backing up project {request.project_name} for user: {request.user_id}")

    try:
        from ..core.workspace_sync import backup_project_to_s3

        result = await backup_project_to_s3(
            user_id=request.user_id,
            project_name=request.project_name,
            bucket_name=S3_BUCKET,
            s3_prefix=S3_PREFIX,
            local_base_path=LOCAL_BASE_PATH,
        )

        return result

    except Exception as e:
        logger.error(f"Error backing up project for user {request.user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to backup project: {str(e)}")
