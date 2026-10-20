"""
Claude Directory Sync Manager.

Manages synchronization and backup of user .claude directories to S3.
Tracks sync state to avoid duplicate initial syncs and provides periodic backup.
"""

import asyncio
import logging
import os
from typing import Optional, Set

from .workspace_sync import (
    backup_claude_dir_to_s3,
    backup_project_to_s3,
    sync_claude_dir_from_s3,
    WorkspaceSyncError,
)

logger = logging.getLogger(__name__)


class ClaudeSyncManager:
    """
    Manages .claude directory synchronization and backup for users.

    - Tracks which users have had their initial sync
    - Prevents duplicate initial syncs
    - Provides periodic backup functionality
    """

    def __init__(
        self,
        bucket_name: str,
        s3_prefix: str = "user_data",
        backup_interval_minutes: int = 10,
        workspace_base_path: str = "/workspace",
    ):
        """
        Initialize Claude Sync Manager.

        Args:
            bucket_name: S3 bucket name for sync/backup
            s3_prefix: S3 key prefix (default: "user_data")
            backup_interval_minutes: Interval for periodic backups (default: 10)
            workspace_base_path: Base path for workspace projects (default: "/workspace")
        """
        self.bucket_name = bucket_name
        self.s3_prefix = s3_prefix
        self.backup_interval_minutes = backup_interval_minutes
        self.workspace_base_path = workspace_base_path

        # Track users who have completed initial sync
        self._synced_users: Set[str] = set()

        # Track current project for each user (user_id -> project_name)
        self._user_projects: dict[str, Optional[str]] = {}

        # Background task handle
        self._backup_task: Optional[asyncio.Task] = None

        # Flag to control backup loop
        self._running = False

    async def ensure_initial_sync(self, user_id: str) -> dict:
        """
        Ensure user's .claude directory is synced (first time only).

        If S3 has data: downloads from S3 to local
        If S3 is empty but local has data: uploads local to S3

        This method is idempotent - it will only sync once per user per
        server lifetime.

        Args:
            user_id: User ID

        Returns:
            dict: Sync result with status, message, files_synced, etc.
        """
        # Check if user already synced
        if user_id in self._synced_users:
            logger.debug(f"✓ User {user_id} already synced in this session")
            return {
                "status": "already_synced",
                "user_id": user_id,
                "message": "User already synced in this session",
            }

        msg = f"🔄 Starting initial .claude sync for user {user_id}"
        print(msg)
        logger.info(msg)

        try:
            # Attempt to sync from S3
            result = await sync_claude_dir_from_s3(
                user_id=user_id,
                bucket_name=self.bucket_name,
                s3_prefix=self.s3_prefix,
            )

            # If S3 had no data, try to backup local data to S3
            if result.get("status") == "skipped":
                s3_path = f"s3://{self.bucket_name}/{self.s3_prefix}/{user_id}/.claude/"
                msg = (
                    f"⏭️  No S3 data found for user {user_id}\n"
                    f"   📍 S3 Path: {s3_path}\n"
                    f"   Checking for local .claude data to backup"
                )
                print(msg)
                logger.info(msg)

                # Try to backup local .claude to S3
                backup_result = await self.backup_user_claude_dir(user_id)

                if backup_result.get("status") == "success":
                    s3_path = backup_result.get("s3_path", "")
                    msg = (
                        f"✅ Initial backup completed for user {user_id}: "
                        f"{backup_result.get('files_synced', 0)} files backed up\n"
                        f"   📍 S3 Path: {s3_path}"
                    )
                    print(msg)
                    logger.info(msg)
                    # Mark user as synced after successful backup
                    self._synced_users.add(user_id)
                    return backup_result
                elif backup_result.get("status") == "skipped":
                    local_path = backup_result.get("local_path", "~/.claude")
                    msg = (
                        f"⏭️  No local .claude data to backup for user {user_id}\n"
                        f"   📂 Local Path: {local_path}"
                    )
                    print(msg)
                    logger.info(msg)
                    # Still mark as synced to avoid repeated checks
                    self._synced_users.add(user_id)
                    return result

            # Mark user as synced (S3 data was downloaded successfully)
            self._synced_users.add(user_id)

            if result.get("status") == "success":
                s3_path = result.get("s3_path", "")
                msg = (
                    f"✅ Initial sync completed for user {user_id}: "
                    f"{result.get('files_synced', 0)} files synced from S3\n"
                    f"   📍 S3 Path: {s3_path}"
                )
                print(msg)
                logger.info(msg)

            return result

        except WorkspaceSyncError as e:
            logger.error(f"❌ Failed to sync .claude for user {user_id}: {e}")
            # Don't add to synced_users on error - allow retry
            return {
                "status": "error",
                "user_id": user_id,
                "message": f"Sync failed: {str(e)}",
            }

    def set_user_project(self, user_id: str, project_name: Optional[str]):
        """Set the current project for a user."""
        self._user_projects[user_id] = project_name
        logger.debug(f"Set project for user {user_id}: {project_name}")

    def get_user_project(self, user_id: str) -> Optional[str]:
        """Get the current project for a user."""
        return self._user_projects.get(user_id)

    async def backup_user_claude_dir(self, user_id: str) -> dict:
        """
        Backup a single user's .claude directory to S3.

        Args:
            user_id: User ID

        Returns:
            dict: Backup result
        """
        try:
            result = await backup_claude_dir_to_s3(
                user_id=user_id,
                bucket_name=self.bucket_name,
                s3_prefix=self.s3_prefix,
            )
            return result

        except WorkspaceSyncError as e:
            logger.error(f"Failed to backup .claude for user {user_id}: {e}")
            return {
                "status": "error",
                "user_id": user_id,
                "message": f"Backup failed: {str(e)}",
            }

    async def backup_user_project(self, user_id: str, project_name: str) -> dict:
        """
        Backup a single user's project workspace to S3.

        Args:
            user_id: User ID
            project_name: Project name

        Returns:
            dict: Backup result
        """
        try:
            result = await backup_project_to_s3(
                user_id=user_id,
                project_name=project_name,
                bucket_name=self.bucket_name,
                s3_prefix=self.s3_prefix,
                local_base_path=self.workspace_base_path,
            )
            return result

        except WorkspaceSyncError as e:
            logger.error(f"Failed to backup project {project_name} for user {user_id}: {e}")
            return {
                "status": "error",
                "user_id": user_id,
                "project_name": project_name,
                "message": f"Backup failed: {str(e)}",
            }

    async def backup_after_task(self, user_id: str):
        """
        Trigger immediate backup after agent completes a task.
        Backs up both .claude directory and current project workspace.

        Args:
            user_id: User ID
        """
        if not user_id:
            logger.warning("⚠️  Backup skipped: user_id is None")
            return

        logger.info(f"🔄 Starting post-task backup for user {user_id}")

        await self.backup_user_claude_dir(user_id)

        project_name = self._user_projects.get(user_id)
        if project_name:
            project_result = await self.backup_user_project(user_id, project_name)
            if project_result.get("status") == "success":
                logger.info(
                    f"✅ Backed up project {project_name}: "
                    f"{project_result.get('files_synced', 0)} files"
                )
        else:
            logger.debug(f"⏭️  No active project for user {user_id}, skipping project backup")

    async def _backup_loop(self):
        """Background loop for periodic backups of all synced users."""
        msg = (
            f"🔄 Starting .claude backup loop "
            f"(interval: {self.backup_interval_minutes} minutes)"
        )
        print(msg)
        logger.info(msg)

        while self._running:
            try:
                # Wait for the backup interval
                logger.debug(f"⏰ Waiting {self.backup_interval_minutes} minutes until next backup...")
                await asyncio.sleep(self.backup_interval_minutes * 60)

                if not self._running:
                    break

                # Get list of synced users
                users_to_backup = list(self._synced_users)

                if not users_to_backup:
                    logger.debug("⏭️  No users to backup")
                    continue

                logger.info(f"📦 Starting periodic backup for {len(users_to_backup)} users")

                # Backup each user
                success_count = 0
                skip_count = 0
                error_count = 0

                for user_id in users_to_backup:
                    if not self._running:
                        break

                    try:
                        result = await self.backup_user_claude_dir(user_id)
                        if result["status"] == "success":
                            success_count += 1
                            logger.info(
                                f"✅ Backed up .claude for user {user_id}: "
                                f"{result.get('files_synced', 0)} files"
                            )
                        elif result["status"] == "skipped":
                            skip_count += 1
                            logger.debug(
                                f"⏭️  Skipped backup for user {user_id}: "
                                f"{result.get('message', 'No data')}"
                            )
                        elif result["status"] == "error":
                            error_count += 1
                            logger.warning(
                                f"⚠️  Error backing up user {user_id}: "
                                f"{result.get('message', 'Unknown error')}"
                            )

                        project_name = self._user_projects.get(user_id)
                        if project_name:
                            project_result = await self.backup_user_project(user_id, project_name)
                            if project_result["status"] == "success":
                                logger.info(
                                    f"✅ Backed up project {project_name} for user {user_id}: "
                                    f"{project_result.get('files_synced', 0)} files"
                                )
                            elif project_result["status"] == "skipped":
                                logger.debug(
                                    f"⏭️  Skipped project backup for {project_name}: "
                                    f"{project_result.get('message', 'No data')}"
                                )
                            elif project_result["status"] == "error":
                                logger.warning(
                                    f"⚠️  Error backing up project {project_name}: "
                                    f"{project_result.get('message', 'Unknown error')}"
                                )

                    except Exception as e:
                        error_count += 1
                        logger.error(
                            f"❌ Exception backing up user {user_id}: {e}",
                            exc_info=True
                        )

                logger.info(
                    f"✅ Periodic backup completed: "
                    f"{success_count} succeeded, {skip_count} skipped, {error_count} errors"
                )

            except asyncio.CancelledError:
                logger.info("🛑 Backup loop cancelled")
                break
            except Exception as e:
                logger.error(f"❌ Error in backup loop: {e}", exc_info=True)
                # Continue running even if one iteration fails

        logger.info("🛑 Backup loop stopped")

    def start_backup_task(self):
        """Start the background backup task."""
        if self._backup_task is not None:
            msg = "⚠️  Backup task already running"
            print(msg)
            logger.warning(msg)
            return

        self._running = True
        self._backup_task = asyncio.create_task(self._backup_loop())
        msg = "🚀 Background backup task started"
        print(msg)
        logger.info(msg)

    async def stop_backup_task(self):
        """Stop the background backup task."""
        if self._backup_task is None:
            return

        logger.info("🛑 Stopping background backup task...")
        self._running = False

        if self._backup_task and not self._backup_task.done():
            self._backup_task.cancel()
            try:
                await self._backup_task
            except asyncio.CancelledError:
                pass

        self._backup_task = None
        logger.info("✅ Background backup task stopped")

    def get_synced_users(self) -> Set[str]:
        """Get set of users who have been synced."""
        return self._synced_users.copy()

    def get_stats(self) -> dict:
        """Get sync manager statistics."""
        return {
            "synced_user_count": len(self._synced_users),
            "backup_running": self._backup_task is not None and not self._backup_task.done(),
            "backup_interval_minutes": self.backup_interval_minutes,
            "bucket_name": self.bucket_name,
            "s3_prefix": self.s3_prefix,
        }


# Global singleton instance
_claude_sync_manager: Optional[ClaudeSyncManager] = None


def get_claude_sync_manager() -> Optional[ClaudeSyncManager]:
    """Get the global ClaudeSyncManager instance."""
    return _claude_sync_manager


def initialize_claude_sync_manager(
    bucket_name: Optional[str] = None,
    s3_prefix: str = "user_data",
    backup_interval_minutes: Optional[int] = None,
) -> Optional[ClaudeSyncManager]:
    """
    Initialize the global ClaudeSyncManager.

    Args:
        bucket_name: S3 bucket name (from env if not provided)
        s3_prefix: S3 key prefix
        backup_interval_minutes: Backup interval (from env if not provided)

    Returns:
        ClaudeSyncManager instance or None if not configured
    """
    global _claude_sync_manager

    # Get bucket name from env if not provided
    if bucket_name is None:
        bucket_name = os.environ.get("S3_WORKSPACE_BUCKET")

    if not bucket_name:
        msg = "⚠️  S3_WORKSPACE_BUCKET not configured, .claude sync/backup will be disabled"
        print(msg)
        logger.warning(msg)
        return None

    # Get backup interval from env if not provided
    if backup_interval_minutes is None:
        backup_interval_minutes = int(
            os.environ.get("CLAUDE_BACKUP_INTERVAL_MINUTES", "5")
        )

    msg = (
        f"🔧 Initializing Claude Sync Manager: "
        f"bucket={bucket_name}, prefix={s3_prefix}, "
        f"interval={backup_interval_minutes}m"
    )
    print(msg)
    logger.info(msg)

    _claude_sync_manager = ClaudeSyncManager(
        bucket_name=bucket_name,
        s3_prefix=s3_prefix,
        backup_interval_minutes=backup_interval_minutes,
    )

    return _claude_sync_manager
