"""
Plugin management endpoints.

Provides API endpoints for managing Claude plugins and marketplaces.
Handles:
- Listing marketplaces and their plugins
- Adding/removing marketplaces (clone/delete git repos)
- Enabling/disabling plugins (modify installed_plugins.json)
"""

import asyncio
import json
import logging
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# Configuration paths
CLAUDE_DIR = Path("/root/.claude")
CLAUDE_PLUGINS_DIR = CLAUDE_DIR / "plugins"
INSTALLED_PLUGINS_PATH = CLAUDE_PLUGINS_DIR / "installed_plugins.json"
KNOWN_MARKETPLACES_PATH = CLAUDE_PLUGINS_DIR / "known_marketplaces.json"
MARKETPLACES_DIR = CLAUDE_PLUGINS_DIR / "marketplaces"
SETTINGS_PATH = CLAUDE_DIR / "settings.json"


# Request/Response models
class PluginInfo(BaseModel):
    """Information about a plugin."""
    name: str
    description: Optional[str] = None
    version: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    homepage: Optional[str] = None
    tags: Optional[list[str]] = None
    author: Optional[dict] = None
    skills: Optional[list[str]] = None
    lsp_servers: Optional[dict] = None
    strict: Optional[bool] = None


class InstalledPluginInfo(BaseModel):
    """Information about an installed plugin."""
    scope: str
    install_path: str
    version: str
    installed_at: str
    last_updated: str
    is_local: bool


class MarketplaceInfo(BaseModel):
    """Information about a marketplace."""
    name: str
    description: Optional[str] = None
    source: dict
    install_location: str
    last_updated: str
    owner: Optional[dict] = None
    plugins: list[PluginInfo] = []


class ListMarketplacesResponse(BaseModel):
    """Response containing list of marketplaces."""
    marketplaces: list[MarketplaceInfo]
    installed_plugins: dict[str, list[InstalledPluginInfo]]


class AddMarketplaceRequest(BaseModel):
    """Request to add a new marketplace."""
    name: str
    git_url: str


class AddMarketplaceResponse(BaseModel):
    """Response from adding a marketplace."""
    status: str
    message: str
    marketplace_name: str


class DeleteMarketplaceResponse(BaseModel):
    """Response from deleting a marketplace."""
    status: str
    message: str
    marketplace_name: str


class InstallPluginRequest(BaseModel):
    """Request to install/enable a plugin."""
    plugin_name: str
    marketplace_name: str


class InstallPluginResponse(BaseModel):
    """Response from installing a plugin."""
    status: str
    message: str
    plugin_name: str
    marketplace_name: str


class UninstallPluginResponse(BaseModel):
    """Response from uninstalling a plugin."""
    status: str
    message: str
    plugin_name: str


class PluginDetailResponse(BaseModel):
    """Detailed information about a specific plugin."""
    plugin: PluginInfo
    marketplace_name: str
    installed: bool
    install_info: Optional[InstalledPluginInfo] = None


def _read_json_file(path: Path) -> dict:
    """Read and parse a JSON file."""
    if not path.exists():
        return {}
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in {path}: {e}")
        return {}


def _write_json_file(path: Path, data: dict):
    """Write data to a JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def _enable_plugin_in_settings(plugin_key: str):
    """Add plugin to enabledPlugins in settings.json."""
    settings = _read_json_file(SETTINGS_PATH)
    if 'enabledPlugins' not in settings:
        settings['enabledPlugins'] = {}
    settings['enabledPlugins'][plugin_key] = True
    _write_json_file(SETTINGS_PATH, settings)
    logger.info(f"Enabled plugin '{plugin_key}' in settings.json")


def _disable_plugin_in_settings(plugin_key: str):
    """Remove plugin from enabledPlugins in settings.json."""
    settings = _read_json_file(SETTINGS_PATH)
    if 'enabledPlugins' in settings and plugin_key in settings['enabledPlugins']:
        del settings['enabledPlugins'][plugin_key]
        _write_json_file(SETTINGS_PATH, settings)
        logger.info(f"Disabled plugin '{plugin_key}' in settings.json")


def _load_marketplace_plugins(marketplace_dir: Path) -> tuple[Optional[dict], list[PluginInfo]]:
    """Load plugins from a marketplace directory."""
    marketplace_json_path = marketplace_dir / ".claude-plugin" / "marketplace.json"

    if not marketplace_json_path.exists():
        logger.warning(f"Marketplace JSON not found at {marketplace_json_path}")
        return None, []

    try:
        with open(marketplace_json_path, 'r') as f:
            marketplace_data = json.load(f)

        plugins = []
        for plugin_data in marketplace_data.get('plugins', []):
            plugin = PluginInfo(
                name=plugin_data.get('name', ''),
                description=plugin_data.get('description'),
                version=plugin_data.get('version'),
                category=plugin_data.get('category'),
                source=plugin_data.get('source') if isinstance(plugin_data.get('source'), str) else None,
                homepage=plugin_data.get('homepage'),
                tags=plugin_data.get('tags'),
                author=plugin_data.get('author'),
                skills=plugin_data.get('skills'),
                lsp_servers=plugin_data.get('lspServers'),
                strict=plugin_data.get('strict'),
            )
            plugins.append(plugin)

        return marketplace_data, plugins
    except Exception as e:
        logger.error(f"Error loading marketplace {marketplace_dir}: {e}")
        return None, []


@router.get("/plugins", response_model=ListMarketplacesResponse)
async def list_plugins():
    """
    List all marketplaces and their plugins.

    Returns information about:
    - Known marketplaces and their available plugins
    - Currently installed/enabled plugins

    Returns:
        ListMarketplacesResponse with marketplace and plugin information
    """
    logger.info("Listing plugins and marketplaces")

    # Load known marketplaces
    known_marketplaces = _read_json_file(KNOWN_MARKETPLACES_PATH)

    # Load installed plugins
    installed_data = _read_json_file(INSTALLED_PLUGINS_PATH)
    installed_plugins_raw = installed_data.get('plugins', {})

    # Convert installed plugins to response format
    installed_plugins = {}
    for plugin_key, install_list in installed_plugins_raw.items():
        installed_plugins[plugin_key] = [
            InstalledPluginInfo(
                scope=info.get('scope', 'user'),
                install_path=info.get('installPath', ''),
                version=info.get('version', 'unknown'),
                installed_at=info.get('installedAt', ''),
                last_updated=info.get('lastUpdated', ''),
                is_local=info.get('isLocal', False),
            )
            for info in install_list
        ]

    # Load marketplace details
    marketplaces = []
    for marketplace_name, marketplace_info in known_marketplaces.items():
        install_location = marketplace_info.get('installLocation', '')
        marketplace_dir = Path(install_location)

        marketplace_data, plugins = _load_marketplace_plugins(marketplace_dir)

        owner = None
        description = None
        if marketplace_data:
            owner = marketplace_data.get('owner')
            description = marketplace_data.get('description')

        marketplace = MarketplaceInfo(
            name=marketplace_name,
            description=description,
            source=marketplace_info.get('source', {}),
            install_location=install_location,
            last_updated=marketplace_info.get('lastUpdated', ''),
            owner=owner,
            plugins=plugins,
        )
        marketplaces.append(marketplace)

    return ListMarketplacesResponse(
        marketplaces=marketplaces,
        installed_plugins=installed_plugins,
    )


@router.post("/plugins/marketplaces", response_model=AddMarketplaceResponse)
async def add_marketplace(request: AddMarketplaceRequest):
    """
    Add a new marketplace by cloning a git repository.

    Clones the repository to ~/.claude/plugins/marketplaces/{name}/
    and updates known_marketplaces.json.

    Args:
        request: AddMarketplaceRequest containing name and git_url

    Returns:
        AddMarketplaceResponse with operation status

    Raises:
        HTTPException: If marketplace already exists or clone fails
    """
    logger.info(f"Adding marketplace '{request.name}' from {request.git_url}")

    # Check if marketplace already exists
    known_marketplaces = _read_json_file(KNOWN_MARKETPLACES_PATH)
    if request.name in known_marketplaces:
        raise HTTPException(
            status_code=400,
            detail=f"Marketplace '{request.name}' already exists"
        )

    # Determine install location
    install_location = MARKETPLACES_DIR / request.name

    if install_location.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Directory already exists at {install_location}"
        )

    # Clone the repository
    try:
        # Ensure parent directory exists
        MARKETPLACES_DIR.mkdir(parents=True, exist_ok=True)

        # Clone using git
        process = await asyncio.create_subprocess_exec(
            'git', 'clone', request.git_url, str(install_location),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise HTTPException(
                status_code=500,
                detail=f"Git clone failed: {error_msg}"
            )

        # Extract repo info from git URL for source field
        # Handle both https://github.com/owner/repo.git and owner/repo formats
        repo_info = request.git_url
        if repo_info.endswith('.git'):
            repo_info = repo_info[:-4]
        if 'github.com/' in repo_info:
            repo_info = repo_info.split('github.com/')[-1]

        # Update known_marketplaces.json
        from datetime import datetime, timezone
        known_marketplaces[request.name] = {
            "source": {
                "source": "github",
                "repo": repo_info
            },
            "installLocation": str(install_location),
            "lastUpdated": datetime.now(timezone.utc).isoformat()
        }

        _write_json_file(KNOWN_MARKETPLACES_PATH, known_marketplaces)

        logger.info(f"Successfully added marketplace '{request.name}'")
        return AddMarketplaceResponse(
            status="success",
            message=f"Marketplace '{request.name}' added successfully",
            marketplace_name=request.name
        )

    except HTTPException:
        raise
    except Exception as e:
        # Clean up on failure
        if install_location.exists():
            shutil.rmtree(install_location, ignore_errors=True)
        logger.error(f"Error adding marketplace: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add marketplace: {str(e)}"
        )


@router.delete("/plugins/marketplaces/{marketplace_name}", response_model=DeleteMarketplaceResponse)
async def delete_marketplace(marketplace_name: str):
    """
    Delete a marketplace and remove its directory.

    Removes the marketplace from known_marketplaces.json and deletes
    the repository directory.

    Args:
        marketplace_name: Name of the marketplace to delete

    Returns:
        DeleteMarketplaceResponse with operation status

    Raises:
        HTTPException: If marketplace not found or deletion fails
    """
    logger.info(f"Deleting marketplace '{marketplace_name}'")

    # Load known marketplaces
    known_marketplaces = _read_json_file(KNOWN_MARKETPLACES_PATH)

    if marketplace_name not in known_marketplaces:
        raise HTTPException(
            status_code=404,
            detail=f"Marketplace '{marketplace_name}' not found"
        )

    try:
        # Get install location
        install_location = known_marketplaces[marketplace_name].get('installLocation', '')

        # Remove from known_marketplaces.json
        del known_marketplaces[marketplace_name]
        _write_json_file(KNOWN_MARKETPLACES_PATH, known_marketplaces)

        # Delete the directory
        if install_location and Path(install_location).exists():
            shutil.rmtree(install_location)
            logger.info(f"Deleted marketplace directory: {install_location}")

        # Also remove any installed plugins from this marketplace
        installed_data = _read_json_file(INSTALLED_PLUGINS_PATH)
        installed_plugins = installed_data.get('plugins', {})

        # Find and remove plugins from this marketplace
        keys_to_remove = [
            key for key in installed_plugins.keys()
            if key.endswith(f'@{marketplace_name}')
        ]

        for key in keys_to_remove:
            del installed_plugins[key]
            # Also disable in settings.json
            _disable_plugin_in_settings(key)
            logger.info(f"Removed installed plugin: {key}")

        if keys_to_remove:
            installed_data['plugins'] = installed_plugins
            _write_json_file(INSTALLED_PLUGINS_PATH, installed_data)

        logger.info(f"Successfully deleted marketplace '{marketplace_name}'")
        return DeleteMarketplaceResponse(
            status="success",
            message=f"Marketplace '{marketplace_name}' deleted successfully",
            marketplace_name=marketplace_name
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting marketplace: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete marketplace: {str(e)}"
        )


@router.post("/plugins/install", response_model=InstallPluginResponse)
async def install_plugin(request: InstallPluginRequest):
    """
    Install/enable a plugin from a marketplace.

    Adds the plugin to installed_plugins.json.

    Args:
        request: InstallPluginRequest containing plugin_name and marketplace_name

    Returns:
        InstallPluginResponse with operation status

    Raises:
        HTTPException: If marketplace or plugin not found, or install fails
    """
    logger.info(f"Installing plugin '{request.plugin_name}' from '{request.marketplace_name}'")

    # Verify marketplace exists
    known_marketplaces = _read_json_file(KNOWN_MARKETPLACES_PATH)
    if request.marketplace_name not in known_marketplaces:
        raise HTTPException(
            status_code=404,
            detail=f"Marketplace '{request.marketplace_name}' not found"
        )

    # Load marketplace to verify plugin exists
    marketplace_info = known_marketplaces[request.marketplace_name]
    marketplace_dir = Path(marketplace_info.get('installLocation', ''))
    marketplace_data, plugins = _load_marketplace_plugins(marketplace_dir)

    # Find the plugin
    plugin_info = None
    for plugin in plugins:
        if plugin.name == request.plugin_name:
            plugin_info = plugin
            break

    if not plugin_info:
        raise HTTPException(
            status_code=404,
            detail=f"Plugin '{request.plugin_name}' not found in marketplace '{request.marketplace_name}'"
        )

    try:
        # Load installed plugins
        installed_data = _read_json_file(INSTALLED_PLUGINS_PATH)
        if 'version' not in installed_data:
            installed_data['version'] = 2
        if 'plugins' not in installed_data:
            installed_data['plugins'] = {}

        # Create plugin key
        plugin_key = f"{request.plugin_name}@{request.marketplace_name}"

        # Check if already installed
        if plugin_key in installed_data['plugins']:
            return InstallPluginResponse(
                status="already_installed",
                message=f"Plugin '{request.plugin_name}' is already installed",
                plugin_name=request.plugin_name,
                marketplace_name=request.marketplace_name
            )

        # Create install entry
        from datetime import datetime, timezone
        cache_path = CLAUDE_PLUGINS_DIR / "cache" / request.marketplace_name / request.plugin_name / (plugin_info.version or "unknown")

        now = datetime.now(timezone.utc).isoformat()
        install_entry = {
            "scope": "user",
            "installPath": str(cache_path),
            "version": plugin_info.version or "unknown",
            "installedAt": now,
            "lastUpdated": now,
            "isLocal": True
        }

        installed_data['plugins'][plugin_key] = [install_entry]

        # Write updated installed plugins
        _write_json_file(INSTALLED_PLUGINS_PATH, installed_data)

        # Also update settings.json to enable the plugin
        _enable_plugin_in_settings(plugin_key)

        logger.info(f"Successfully enabled plugin '{request.plugin_name}'")
        return InstallPluginResponse(
            status="success",
            message=f"Plugin '{request.plugin_name}' installed successfully",
            plugin_name=request.plugin_name,
            marketplace_name=request.marketplace_name
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error installing plugin: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to install plugin: {str(e)}"
        )


@router.delete("/plugins/install/{plugin_key}", response_model=UninstallPluginResponse)
async def uninstall_plugin(plugin_key: str):
    """
    Uninstall/disable a plugin.

    Removes the plugin from installed_plugins.json.
    Plugin key format: plugin_name@marketplace_name

    Args:
        plugin_key: The plugin key (e.g., "context7@claude-plugins-official")

    Returns:
        UninstallPluginResponse with operation status

    Raises:
        HTTPException: If plugin not found or uninstall fails
    """
    logger.info(f"Uninstalling plugin '{plugin_key}'")

    try:
        # Load installed plugins
        installed_data = _read_json_file(INSTALLED_PLUGINS_PATH)
        installed_plugins = installed_data.get('plugins', {})

        if plugin_key not in installed_plugins:
            raise HTTPException(
                status_code=404,
                detail=f"Plugin '{plugin_key}' is not installed"
            )

        # Remove the plugin
        del installed_plugins[plugin_key]
        installed_data['plugins'] = installed_plugins

        # Write updated installed plugins
        _write_json_file(INSTALLED_PLUGINS_PATH, installed_data)

        # Also update settings.json to disable the plugin
        _disable_plugin_in_settings(plugin_key)

        logger.info(f"Successfully disabled plugin '{plugin_key}'")
        return UninstallPluginResponse(
            status="success",
            message=f"Plugin '{plugin_key}' uninstalled successfully",
            plugin_name=plugin_key
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uninstalling plugin: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to uninstall plugin: {str(e)}"
        )


@router.get("/plugins/{marketplace_name}/{plugin_name}", response_model=PluginDetailResponse)
async def get_plugin_detail(marketplace_name: str, plugin_name: str):
    """
    Get detailed information about a specific plugin.

    Args:
        marketplace_name: Name of the marketplace
        plugin_name: Name of the plugin

    Returns:
        PluginDetailResponse with detailed plugin information

    Raises:
        HTTPException: If marketplace or plugin not found
    """
    logger.info(f"Getting details for plugin '{plugin_name}' from '{marketplace_name}'")

    # Verify marketplace exists
    known_marketplaces = _read_json_file(KNOWN_MARKETPLACES_PATH)
    if marketplace_name not in known_marketplaces:
        raise HTTPException(
            status_code=404,
            detail=f"Marketplace '{marketplace_name}' not found"
        )

    # Load marketplace plugins
    marketplace_info = known_marketplaces[marketplace_name]
    marketplace_dir = Path(marketplace_info.get('installLocation', ''))
    marketplace_data, plugins = _load_marketplace_plugins(marketplace_dir)

    # Find the plugin
    plugin_info = None
    for plugin in plugins:
        if plugin.name == plugin_name:
            plugin_info = plugin
            break

    if not plugin_info:
        raise HTTPException(
            status_code=404,
            detail=f"Plugin '{plugin_name}' not found in marketplace '{marketplace_name}'"
        )

    # Check if installed
    installed_data = _read_json_file(INSTALLED_PLUGINS_PATH)
    installed_plugins = installed_data.get('plugins', {})
    plugin_key = f"{plugin_name}@{marketplace_name}"

    install_info = None
    is_installed = plugin_key in installed_plugins

    if is_installed and installed_plugins[plugin_key]:
        info = installed_plugins[plugin_key][0]
        install_info = InstalledPluginInfo(
            scope=info.get('scope', 'user'),
            install_path=info.get('installPath', ''),
            version=info.get('version', 'unknown'),
            installed_at=info.get('installedAt', ''),
            last_updated=info.get('lastUpdated', ''),
            is_local=info.get('isLocal', False),
        )

    return PluginDetailResponse(
        plugin=plugin_info,
        marketplace_name=marketplace_name,
        installed=is_installed,
        install_info=install_info
    )


@router.post("/plugins/marketplaces/{marketplace_name}/update", response_model=AddMarketplaceResponse)
async def update_marketplace(marketplace_name: str):
    """
    Update a marketplace by pulling the latest changes from git.

    Args:
        marketplace_name: Name of the marketplace to update

    Returns:
        AddMarketplaceResponse with operation status

    Raises:
        HTTPException: If marketplace not found or update fails
    """
    logger.info(f"Updating marketplace '{marketplace_name}'")

    # Verify marketplace exists
    known_marketplaces = _read_json_file(KNOWN_MARKETPLACES_PATH)
    if marketplace_name not in known_marketplaces:
        raise HTTPException(
            status_code=404,
            detail=f"Marketplace '{marketplace_name}' not found"
        )

    marketplace_info = known_marketplaces[marketplace_name]
    install_location = marketplace_info.get('installLocation', '')

    if not install_location or not Path(install_location).exists():
        raise HTTPException(
            status_code=404,
            detail=f"Marketplace directory not found at {install_location}"
        )

    try:
        # Pull latest changes
        process = await asyncio.create_subprocess_exec(
            'git', 'pull',
            cwd=install_location,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise HTTPException(
                status_code=500,
                detail=f"Git pull failed: {error_msg}"
            )

        # Update lastUpdated timestamp
        from datetime import datetime, timezone
        known_marketplaces[marketplace_name]['lastUpdated'] = datetime.now(timezone.utc).isoformat()
        _write_json_file(KNOWN_MARKETPLACES_PATH, known_marketplaces)

        output = stdout.decode() if stdout else ""
        logger.info(f"Successfully updated marketplace '{marketplace_name}': {output}")

        return AddMarketplaceResponse(
            status="success",
            message=f"Marketplace '{marketplace_name}' updated successfully",
            marketplace_name=marketplace_name
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating marketplace: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update marketplace: {str(e)}"
        )
