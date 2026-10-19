"""
S3 Client using s5cmd.

Provides unified interface for S3 operations using s5cmd for high-performance
parallel transfers.
"""

import asyncio
import logging
import shutil
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class S3ClientError(Exception):
    """Exception raised when S3 operations fail."""
    pass


class S3Client:
    """
    High-performance S3 client using s5cmd.

    Provides methods for checking existence, syncing, and listing S3 objects.
    """

    def __init__(self, bucket_name: str, s3_prefix: str = "user_data"):
        """
        Initialize S3 client.

        Args:
            bucket_name: S3 bucket name
            s3_prefix: S3 key prefix (default: "user_data")
        """
        self.bucket_name = bucket_name
        self.s3_prefix = s3_prefix

        if not self._check_s5cmd_installed():
            raise S3ClientError(
                "s5cmd is not installed. Please install it: "
                "https://github.com/peak/s5cmd#installation"
            )

    def _check_s5cmd_installed(self) -> bool:
        """Check if s5cmd is installed and available."""
        return shutil.which("s5cmd") is not None

    def build_s3_path(self, *path_parts: str) -> str:
        """
        Build S3 path from parts.

        Args:
            *path_parts: Path components to join

        Returns:
            Full S3 path (s3://bucket/prefix/...)
        """
        parts = [self.s3_prefix] + list(path_parts)
        path = "/".join(parts)
        return f"s3://{self.bucket_name}/{path}"

    async def check_exists(self, *path_parts: str) -> bool:
        """
        Check if a directory/file exists in S3.

        Args:
            *path_parts: Path components relative to s3_prefix

        Returns:
            True if path exists and has objects, False otherwise
        """
        s3_path = self.build_s3_path(*path_parts) + "/"

        try:
            process = await asyncio.create_subprocess_exec(
                "s5cmd",
                "ls",
                s3_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()
            stdout_text = stdout.decode() if stdout else ""
            stderr_text = stderr.decode() if stderr else ""

            # Debug logging
            logger.debug(f"🔍 S3 check: {s3_path}")
            logger.debug(f"   Return code: {process.returncode}")
            logger.debug(f"   Output length: {len(stdout_text)} chars")

            if process.returncode != 0:
                logger.debug(f"   Stderr: {stderr_text}")
                return False

            exists = bool(stdout_text.strip())
            logger.debug(f"   Result: {'EXISTS' if exists else 'NOT FOUND'}")

            return exists

        except Exception as e:
            logger.error(f"Failed to check S3 path {s3_path}: {e}")
            return False

    async def sync_from_s3(
        self,
        s3_path_parts: list[str],
        local_path: Path,
        dry_run: bool = False,
    ) -> dict:
        """
        Sync from S3 to local directory.

        Args:
            s3_path_parts: Path components relative to s3_prefix
            local_path: Local destination directory
            dry_run: If True, only simulate the sync

        Returns:
            Dict with status, files_synced, output, etc.

        Raises:
            S3ClientError: If sync fails
        """
        s3_path = self.build_s3_path(*s3_path_parts) + "/"

        # Ensure local directory exists
        local_path.mkdir(parents=True, exist_ok=True)

        logger.info(f"⬇️  Syncing from {s3_path} to {local_path}")

        # Build s5cmd command
        cmd = ["s5cmd", "sync"]

        if dry_run:
            cmd.append("--dry-run")

        cmd.extend([
            s3_path + "*",
            str(local_path) + "/",
        ])

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()
            stdout_text = stdout.decode() if stdout else ""
            stderr_text = stderr.decode() if stderr else ""

            if process.returncode != 0:
                error_msg = f"s5cmd sync failed (exit {process.returncode}): {stderr_text}"
                logger.error(error_msg)
                raise S3ClientError(error_msg)

            # Count files synced
            files_synced = len([line for line in stdout_text.strip().split('\n') if line])

            logger.info(f"✅ Synced {files_synced} files from S3")

            return {
                "status": "success",
                "s3_path": s3_path,
                "local_path": str(local_path),
                "files_synced": files_synced,
                "dry_run": dry_run,
                "output": stdout_text,
            }

        except S3ClientError:
            raise
        except Exception as e:
            error_msg = f"Failed to sync from S3: {str(e)}"
            logger.error(error_msg, exc_info=True)
            raise S3ClientError(error_msg) from e

    async def sync_to_s3(
        self,
        local_path: Path,
        s3_path_parts: list[str],
        dry_run: bool = False,
    ) -> dict:
        """
        Sync from local directory to S3.

        Args:
            local_path: Local source directory
            s3_path_parts: Path components relative to s3_prefix
            dry_run: If True, only simulate the sync

        Returns:
            Dict with status, files_synced, output, etc.

        Raises:
            S3ClientError: If sync fails or local path doesn't exist
        """
        if not local_path.exists():
            return {
                "status": "skipped",
                "local_path": str(local_path),
                "message": "Local path does not exist",
                "files_synced": 0,
            }

        s3_path = self.build_s3_path(*s3_path_parts) + "/"

        logger.info(f"⬆️  Syncing from {local_path} to {s3_path}")

        # Build s5cmd command
        cmd = ["s5cmd", "sync"]

        if dry_run:
            cmd.append("--dry-run")

        cmd.extend([
            str(local_path) + "/*",
            s3_path,
        ])

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()
            stdout_text = stdout.decode() if stdout else ""
            stderr_text = stderr.decode() if stderr else ""

            if process.returncode != 0:
                error_msg = f"s5cmd sync failed (exit {process.returncode}): {stderr_text}"
                logger.error(error_msg)
                raise S3ClientError(error_msg)

            # Count files synced
            files_synced = len([line for line in stdout_text.strip().split('\n') if line])

            logger.info(f"✅ Synced {files_synced} files to S3")

            return {
                "status": "success",
                "local_path": str(local_path),
                "s3_path": s3_path,
                "files_synced": files_synced,
                "dry_run": dry_run,
                "output": stdout_text,
            }

        except S3ClientError:
            raise
        except Exception as e:
            error_msg = f"Failed to sync to S3: {str(e)}"
            logger.error(error_msg, exc_info=True)
            raise S3ClientError(error_msg) from e

    async def list_directories(self, *path_parts: str) -> list[str]:
        """
        List subdirectories at given S3 path.

        Args:
            *path_parts: Path components relative to s3_prefix

        Returns:
            List of directory names (not full paths)
        """
        s3_path = self.build_s3_path(*path_parts) + "/"

        try:
            process = await asyncio.create_subprocess_exec(
                "s5cmd",
                "ls",
                s3_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()
            stdout_text = stdout.decode() if stdout else ""

            if not stdout_text.strip():
                logger.debug(f"No directories found at {s3_path}")
                return []

            # Parse s5cmd ls output to extract directory names
            # Format: "                                  DIR  dirname/"
            # or: "DIR s3://bucket/prefix/path/dirname/"
            directories = []
            for line in stdout_text.strip().split('\n'):
                line = line.strip()
                if not line:
                    continue

                # Check if line contains DIR (with or without leading spaces)
                if "DIR" in line:
                    # Extract the last token which should be the directory name with trailing slash
                    tokens = line.split()
                    if len(tokens) >= 2:
                        dir_path = tokens[-1].rstrip('/')
                        # Get just the directory name (last part of path)
                        dir_name = dir_path.split('/')[-1] if '/' in dir_path else dir_path
                        if dir_name:
                            directories.append(dir_name)

            logger.debug(f"Found {len(directories)} directories at {s3_path}")
            return directories

        except Exception as e:
            logger.error(f"Failed to list directories: {e}")
            return []
