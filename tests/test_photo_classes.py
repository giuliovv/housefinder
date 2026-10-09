import numpy as np

from scraper import photo_classes as pc
from tests import vecs


def probs(*vectors):
    return pc.probabilities(np.asarray(vectors, dtype=np.float32))


def test_rooms_gardens_and_junk_are_told_apart():
    p = probs(vecs.room(1), vecs.outside(2), vecs.junk(3))
    assert list(p.argmax(axis=1)) == [0, 1, 2]
    assert np.allclose(p.sum(axis=1), 1)


def test_deck_requires_a_clear_room_and_ranking_drops_only_clear_junk():
    p = probs(vecs.room(1), vecs.outside(2), vecs.junk(3))
    assert list(pc.is_deck_worthy(p)) == [True, False, False]
    assert list(pc.is_junk(p)) == [False, False, True]


def test_a_blend_of_room_and_junk_is_not_deck_worthy():
    blend = np.asarray(vecs.room(1)) + np.asarray(vecs.junk(1))
    assert not pc.is_deck_worthy(probs(blend))[0] or pc.probabilities(np.asarray([blend]))[0, 0] < 0.99
