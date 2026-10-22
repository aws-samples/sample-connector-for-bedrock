"""/files/upload parses a multipart body (python-multipart) and writes the file."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.files import router


def test_upload_writes_the_file(tmp_path):
    app = FastAPI()
    app.include_router(router)
    target = tmp_path / "uploads"
    content = "héllo\n".encode("utf-8") + bytes(range(256))

    response = TestClient(app).post(
        "/files/upload",
        files={"file": ("notes.bin", content, "application/octet-stream")},
        data={"directory": str(target)},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["success"] is True
    assert body["filename"] == "notes.bin"
    assert body["size"] == len(content)
    assert (target / "notes.bin").read_bytes() == content
