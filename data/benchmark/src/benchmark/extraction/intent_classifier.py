"""Developer intent classification (rule-based).

Port of packages/shared/src/intent-classifier.ts
"""

from __future__ import annotations

import re

from .types import IntentClassification

# ── Intent Rules ────────────────────────────────────────────────────

_INTENT_RULES: list[dict] = [
    {
        "intent": "evaluation",
        "strong": [
            re.compile(r"\b(?:compare|comparison|versus|vs\.?)\b.*\b(?:and|or|to)\b", re.I),
            re.compile(r"\bwhich\s+(?:is|one\s+(?:is|should))\s+(?:better|best|faster|cheaper|more\s+\w+)", re.I),
            re.compile(r"\b(?:pros?\s+(?:and|&|/)\s+cons?)\b", re.I),
            re.compile(r"\b(?:evaluate|benchmark|assess)\b.*\b(?:vendor|tool|service|solution|option)", re.I),
            re.compile(r"\b(?:head-?to-?head|shootout|bake-?\s*off)\b", re.I),
        ],
        "weak": [
            re.compile(r"\b(?:what\s+(?:are|is)\s+the\s+(?:difference|tradeoff)s?\s+between)\b", re.I),
            re.compile(r"\b(?:should\s+I\s+(?:use|pick|choose|go\s+with))\b", re.I),
            re.compile(r"\b(?:recommend|suggestion)\b", re.I),
            re.compile(r"\b(?:better|worse|faster|slower|cheaper|more\s+expensive)\s+than\b", re.I),
        ],
        "sub_intent_patterns": [
            (re.compile(r"\b(?:database|db|postgres|mysql|mongo)", re.I), "database_evaluation"),
            (re.compile(r"\b(?:auth|authentication|identity)", re.I), "auth_evaluation"),
            (re.compile(r"\b(?:hosting|deploy|infra)", re.I), "hosting_evaluation"),
        ],
    },
    {
        "intent": "migration",
        "strong": [
            re.compile(r"\b(?:migrat(?:e|ing|ion))\s+(?:from|away\s+from|off\s+of)", re.I),
            re.compile(r"\b(?:switch|transition|move)\s+(?:from|away\s+from)", re.I),
            re.compile(r"\b(?:replac(?:e|ing))\s+\w+\s+with\b", re.I),
            re.compile(r"\b(?:off-?board|sunset|deprecat(?:e|ing))\b", re.I),
        ],
        "weak": [
            re.compile(r"\bfrom\s+\w+\s+to\s+\w+\b", re.I),
            re.compile(r"\b(?:instead\s+of|alternative\s+to)\b", re.I),
            re.compile(r"\b(?:upgrade|downgrade)\s+(?:from|to)\b", re.I),
        ],
        "sub_intent_patterns": [
            (re.compile(r"\b(?:database|db|postgres|mysql|mongo|supabase|firebase)", re.I), "database_migration"),
            (re.compile(r"\b(?:auth|authentication|clerk|auth0)", re.I), "auth_migration"),
        ],
    },
    {
        "intent": "greenfield",
        "strong": [
            re.compile(r"\b(?:set\s+up|setup|start|build|create)\s+(?:a\s+)?(?:new|fresh)\b", re.I),
            re.compile(r"\b(?:from\s+scratch|brand\s+new|greenfield)\b", re.I),
            re.compile(r"\b(?:bootstrap|scaffold|init(?:ialize)?)\s+(?:a\s+)?(?:new|project|app)", re.I),
            re.compile(r"\b(?:starting\s+a\s+new|building\s+(?:a|my)\s+(?:first|new))\b", re.I),
        ],
        "weak": [
            re.compile(r"\b(?:best\s+(?:stack|setup|way\s+to\s+start))\b", re.I),
            re.compile(r"\b(?:what\s+(?:should|do)\s+I\s+(?:use|pick)\s+for\s+(?:a|my)\s+new)\b", re.I),
            re.compile(r"\b(?:how\s+(?:to|do\s+I)\s+(?:set\s+up|start|build))\b", re.I),
        ],
        "sub_intent_patterns": [
            (re.compile(r"\b(?:saas|web\s+app|full-?\s*stack)", re.I), "saas_setup"),
            (re.compile(r"\b(?:api|backend|server)", re.I), "api_setup"),
            (re.compile(r"\b(?:mobile|react\s+native|flutter)", re.I), "mobile_setup"),
        ],
    },
    {
        "intent": "debugging",
        "strong": [
            re.compile(r"\b(?:fix|debug|troubleshoot|resolve)\b.*\b(?:error|issue|bug|problem|crash)", re.I),
            re.compile(r"\b(?:error|exception|failure|crash|timeout)[:\s]+", re.I),
            re.compile(r"\b(?:not\s+working|doesn['\u2019]t\s+work|broke(?:n)?|failing)\b", re.I),
            re.compile(r"\b(?:stack\s+trace|traceback|segfault|panic)\b", re.I),
        ],
        "weak": [
            re.compile(r"\b(?:why\s+(?:is|does|am\s+I\s+getting))\b", re.I),
            re.compile(r"\b(?:help\s+(?:me\s+)?(?:fix|debug|understand))\b", re.I),
            re.compile(r"\b(?:getting\s+(?:an?\s+)?(?:error|exception|warning))\b", re.I),
            re.compile(r"\b(?:can['\u2019]t|cannot|unable\s+to)\b", re.I),
        ],
        "sub_intent_patterns": [
            (re.compile(r"\b(?:connection|connect|pool|timeout)", re.I), "connection_debugging"),
            (re.compile(r"\b(?:deploy|build|ci|cd)", re.I), "deployment_debugging"),
            (re.compile(r"\b(?:type|typescript|ts)", re.I), "type_debugging"),
        ],
    },
    {
        "intent": "architecture",
        "strong": [
            re.compile(r"\b(?:best\s+practic(?:e|es)|recommended\s+(?:approach|pattern|architecture))\b", re.I),
            re.compile(r"\b(?:how\s+should\s+I\s+(?:structure|architect|design|organize))\b", re.I),
            re.compile(r"\b(?:architecture|design\s+pattern|system\s+design)\b", re.I),
            re.compile(r"\b(?:scalab(?:le|ility)|maintain(?:able|ability)|production-?ready)\b", re.I),
        ],
        "weak": [
            re.compile(r"\b(?:what['\u2019]s\s+the\s+(?:right|correct|proper)\s+way)\b", re.I),
            re.compile(r"\b(?:pattern|approach|strategy)\s+for\b", re.I),
            re.compile(r"\b(?:how\s+(?:to|do\s+(?:you|I))\s+(?:handle|manage|implement))\b", re.I),
        ],
        "sub_intent_patterns": [
            (re.compile(r"\b(?:multi-?\s*tenant|tenant)", re.I), "multi_tenancy"),
            (re.compile(r"\b(?:micro-?\s*service|distributed)", re.I), "microservices"),
            (re.compile(r"\b(?:real-?\s*time|websocket|event-?\s*driven)", re.I), "realtime_architecture"),
        ],
    },
    {
        "intent": "compliance",
        "strong": [
            re.compile(r"\b(?:SOC\s*2|SOC\s*II|SOC2)\b", re.I),
            re.compile(r"\b(?:HIPAA|HITECH)\b", re.I),
            re.compile(r"\b(?:GDPR|CCPA|CPRA)\b", re.I),
            re.compile(r"\b(?:PCI-?\s*DSS)\b", re.I),
            re.compile(r"\b(?:FedRAMP|ITAR|CMMC)\b", re.I),
            re.compile(r"\b(?:data\s+(?:residency|sovereignty|locality))\b", re.I),
        ],
        "weak": [
            re.compile(r"\b(?:complian(?:t|ce)|regulat(?:ory|ion))\b", re.I),
            re.compile(r"\b(?:audit(?:\s+log|\s+trail)?|encryption\s+at\s+rest)\b", re.I),
            re.compile(r"\b(?:eu\s+(?:region|data|hosting)|european\s+(?:data|hosting))\b", re.I),
        ],
        "sub_intent_patterns": [
            (re.compile(r"\b(?:health|medical|patient)", re.I), "healthcare_compliance"),
            (re.compile(r"\b(?:financ|banking|payment)", re.I), "financial_compliance"),
            (re.compile(r"\b(?:eu|europe|gdpr|data\s+residen)", re.I), "eu_compliance"),
        ],
    },
    {
        "intent": "cost_optimization",
        "strong": [
            re.compile(r"\b(?:cheap(?:er|est)|low(?:er)?-?cost|budget|affordable|free\s+tier)\b", re.I),
            re.compile(r"\b(?:reduce|lower|minimize|cut)\s+(?:cost|spending|bill|expense)", re.I),
            re.compile(r"\b(?:cost-?(?:effective|efficient|optimize|saving))\b", re.I),
            re.compile(r"\b(?:pricing|price\s+comparison|how\s+much\s+does)\b", re.I),
        ],
        "weak": [
            re.compile(r"\b(?:free|open-?\s*source|self-?\s*host)\b", re.I),
            re.compile(r"\b(?:pay-?(?:as|per)-?(?:you-?go|use))\b", re.I),
            re.compile(r"\b(?:scale\s+to\s+zero|serverless)\b.*\b(?:cost|price|bill)", re.I),
        ],
        "sub_intent_patterns": [
            (re.compile(r"\b(?:database|db|hosting)", re.I), "database_cost"),
            (re.compile(r"\b(?:startup|side\s+project|hobby)", re.I), "startup_cost"),
        ],
    },
]


def classify_intent(prompt_text: str) -> IntentClassification:
    """Classify a developer prompt's intent using rule-based pattern matching."""
    if not prompt_text or len(prompt_text) < 10:
        return IntentClassification(intent="unknown", confidence=0, sub_intent=None, classifier="rule")

    scores: list[dict] = []

    for rule in _INTENT_RULES:
        score = 0

        for pattern in rule["strong"]:
            if pattern.search(prompt_text):
                score += 2

        for pattern in rule["weak"]:
            if pattern.search(prompt_text):
                score += 1

        if score > 0:
            sub_intent = None
            for pat, si in rule.get("sub_intent_patterns", []):
                if pat.search(prompt_text):
                    sub_intent = si
                    break
            scores.append({"intent": rule["intent"], "score": score, "sub_intent": sub_intent})

    if not scores:
        return IntentClassification(intent="unknown", confidence=0, sub_intent=None, classifier="rule")

    scores.sort(key=lambda s: s["score"], reverse=True)
    top = scores[0]
    max_possible_score = 10

    confidence = min(1.0, top["score"] / max_possible_score)
    if len(scores) > 1:
        gap = top["score"] - scores[1]["score"]
        if gap == 0:
            confidence *= 0.5
        elif gap == 1:
            confidence *= 0.75

    confidence = max(0.2, confidence)
    confidence = round(confidence * 100) / 100

    return IntentClassification(
        intent=top["intent"],
        confidence=confidence,
        sub_intent=top["sub_intent"],
        classifier="rule",
    )
