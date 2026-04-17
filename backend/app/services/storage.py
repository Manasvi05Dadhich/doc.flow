from abc import ABC, abstractmethod
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, upload_file: UploadFile) -> Path:
        raise NotImplementedError

    @abstractmethod
    async def read(self, storage_path: str | Path) -> bytes:
        raise NotImplementedError


class LocalStorageBackend:
    def __init__(self, root: str) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    async def save(self, upload_file: UploadFile) -> Path:
        filename = Path(upload_file.filename or "upload.bin").name
        destination_dir = self.root / str(uuid4())
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / filename
        content = await upload_file.read()
        destination.write_bytes(content)
        await upload_file.seek(0)
        return destination

    async def read(self, storage_path: str | Path) -> bytes:
        return Path(storage_path).read_bytes()
