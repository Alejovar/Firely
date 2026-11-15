"""Local-rules fallback of ai.intent (used when the LLM is unavailable): questions must not become place names."""
from datetime import date

from ai.intent import rules

TODAY = date(2026, 11, 15)


def test_question_keeps_only_the_place():
    r = rules("Es probable que el 2027 en marzo haya un incendio en arteaga?", TODAY)
    assert r["place_text"] == "arteaga" and (r["date_from"], r["date_to"]) == ("2027-03-01", "2027-03-31")


def test_previous_phrasings_unchanged():
    assert rules("Incendios en la sierra de Arteaga en marzo de 2021", TODAY)["place_text"] == "sierra arteaga"
    assert rules("Chilecito julio 2026", TODAY)["place_text"] == "chilecito"
    assert rules("¿Cómo fue la temporada en Coahuila?", TODAY)["place_text"] == "coahuila"
