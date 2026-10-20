"""Forged unsigned JWT for tests that prove a bearer token's claims are ignored.

Built at run time so no JWT literal sits in the repo. It decodes as a real JWT, so a
regression that reads its "sub" again would pick up the forged user and fail the tests.
"""

import base64
import json

FORGED_SUB = "other-user"


def _b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


def forged_jwt(sub=FORGED_SUB):
    return ".".join([_b64({"alg": "none"}), _b64({"sub": sub}), "sig"])
