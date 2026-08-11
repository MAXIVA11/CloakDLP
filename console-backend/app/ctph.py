"""Context-Triggered Piecewise Hashing (CTPH); a from-scratch fuzzy hash, algorithmically in
the spirit of ssdeep/TLSH but not binary-compatible with either. Small edits (insertions,
deletions, reformatting) only perturb the signature characters near the edit, not the whole
hash, so similarity between two hashes degrades gracefully instead of falling off a cliff the
way a cryptographic hash's would.

This exact spec (window size, trigger rule, alphabet, block-size formula) is reimplemented
in the agent (agent/CloakDlp.Agent/Detection/Ctph.cs); the two MUST stay in lockstep, or a
hash produced by one side becomes meaningless to the other. See ARCHITECTURE.md.
"""

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
WINDOW = 7
MIN_BLOCK_SIZE = 3
TARGET_SIG_LENGTH = 64
FNV_OFFSET_BASIS = 0x811C9DC5
FNV_PRIME = 0x01000193
MASK32 = 0xFFFFFFFF


def _fnv1a_step(h: int, byte: int) -> int:
    return ((h ^ byte) * FNV_PRIME) & MASK32


def _window_hash(window: bytes) -> int:
    h = FNV_OFFSET_BASIS
    for b in window:
        h = _fnv1a_step(h, b)
    return h


def _select_block_size(length: int) -> int:
    b = MIN_BLOCK_SIZE
    while length / b > TARGET_SIG_LENGTH:
        b *= 2
    return b


def _signature(data: bytes, block_size: int) -> str:
    out = []
    piece = FNV_OFFSET_BASIS
    window = bytearray()

    for byte in data:
        piece = _fnv1a_step(piece, byte)

        window.append(byte)
        if len(window) > WINDOW:
            window.pop(0)
        if len(window) == WINDOW:
            h = _window_hash(bytes(window))
            if h % block_size == block_size - 1:
                out.append(ALPHABET[piece % 64])
                piece = FNV_OFFSET_BASIS

    if piece != FNV_OFFSET_BASIS or not out:
        out.append(ALPHABET[piece % 64])

    return "".join(out)


def hash_bytes(data: bytes) -> str:
    """Returns "blockSize:sigAtB:sigAt2B". Callers should discard `data` immediately after -
    this is a one-way fuzzy digest, not a copy of the content."""
    if not data:
        return f"{MIN_BLOCK_SIZE}::"

    b = _select_block_size(len(data))
    return f"{b}:{_signature(data, b)}:{_signature(data, b * 2)}"
