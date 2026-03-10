"""Tests for the intent classifier."""

from __future__ import annotations

from benchmark.extraction.intent_classifier import classify_intent


def test_evaluation_intent():
    result = classify_intent("Compare Supabase and Neon - which is better for my SaaS project?")
    assert result.intent == "evaluation"
    assert result.confidence > 0


def test_migration_intent():
    result = classify_intent("I want to migrate from Firebase to Supabase")
    assert result.intent == "migration"
    assert result.confidence > 0


def test_greenfield_intent():
    result = classify_intent("Set up a new Next.js project with a database from scratch")
    assert result.intent == "greenfield"
    assert result.confidence > 0


def test_debugging_intent():
    result = classify_intent("Fix this connection error with my database pool")
    assert result.intent == "debugging"
    assert result.confidence > 0


def test_compliance_intent():
    result = classify_intent("Which database is SOC2 compliant and has HIPAA support?")
    assert result.intent == "compliance"
    assert result.confidence > 0


def test_cost_optimization_intent():
    result = classify_intent("What's the cheapest database with a free tier?")
    assert result.intent == "cost_optimization"
    assert result.confidence > 0


def test_unknown_intent():
    result = classify_intent("hello")
    assert result.intent == "unknown"
    assert result.confidence == 0


def test_sub_intent():
    result = classify_intent("Compare Supabase and Neon database options - which is better?")
    assert result.intent == "evaluation"
    assert result.sub_intent == "database_evaluation"
