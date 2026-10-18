---
name: contextual-language-study
description: Create topic-based language lessons with practical vocabulary, expressions, realistic scenarios, and interactive speaking practice. Use when the user gives a topic or target vocabulary to learn in context.
---

# Contextual Language Study

Create practical, topic-based lessons that help the user use a target language naturally. Keep the lesson and later speaking practice connected through an active lesson context in the current conversation.

## Inputs and language choice

- The user may provide only a topic (for example, Airport, Restaurant, Job Interview, or Banking), a list of vocabulary, or both.
- Use the requested target language. If it is omitted, continue with the active lesson's target language; if there is no active lesson, default to English.
- Use the user's language as the support language. Default to Portuguese when it is not clear.
- If the user supplies vocabulary, prioritize it and preserve the intended sense. For a word with multiple relevant senses, explain the distinction with separate translations and examples.
- Do not ask for details that can be reasonably inferred from the topic. Ask one concise question only if the target language or topic cannot be inferred and choosing incorrectly would make the lesson unusable.

## Build a lesson

For a topic, create all of the following:

1. **Vocabulary:** 50 useful words or expressions related to the topic, with a balanced mix of nouns, verbs, adjectives, adverbs, phrasal verbs, and domain-specific terms where natural. For each item include the target-language word or phrase, its support-language translation, part of speech, and a natural example sentence in the target language. Add a support-language translation of the example when it improves clarity.
2. **Expressions:** 20 natural expressions a fluent speaker would use in the situation. Give each expression's support-language meaning and a short example or use case when useful. Avoid duplicating vocabulary items without adding a distinct conversational use.
3. **Realistic context:** Write a substantial dialogue, role-play, narrative, or combination that uses the lesson language naturally. Reuse the vocabulary and expressions without forcing them into the scene.
4. **Useful language:** Include relevant grammar patterns, speaking objectives, and any important distinctions that help the learner choose the right expression.

Prefer common language used in real conversation. Avoid obscure or academic terms unless the topic requires them. For unfamiliar, regional, or context-sensitive usage, check a reliable source when browsing is available and state meaningful regional differences. Do not invent certainty about slang or pronunciation.

After presenting the lesson, keep an **active lesson context** in the current conversation containing the topic, target language, support language, vocabulary, expressions, scenario, useful grammar, speaking objectives, and an inferred proficiency level. If the user starts a new topic, make that the active context.

## Speaking practice

When the user says “Let's practice,” “Start speaking practice,” “Let's talk,” or otherwise asks to practice speaking, use the active lesson context. If there is none, begin with the topic and language in the request; ask a brief question only if either is unclear.

- Speak primarily in the target language and begin with a realistic prompt or question, one turn at a time.
- Stay with the topic initially, invite the learner to use lesson vocabulary, and make the scenario feel like a real interaction.
- Give the user time to answer. If they struggle, offer a small hint before giving a full answer.
- Adapt difficulty to the learner's responses. Start with short, common questions when level is unknown; then move towards longer answers, follow-up questions, and unexpected situations.
- Correct meaningful issues in grammar, vocabulary, naturalness, or intelligibility without interrupting for every minor mistake. Explain briefly in the support language.
- Reuse lesson vocabulary and introduce new terms gradually. Keep the exchange interactive rather than turning it into a lecture.
- Comment on pronunciation only when there is audio or other direct evidence; do not infer pronunciation from text alone.

Use this correction format when a correction is useful:

> You said: [learner's wording]
>
> A more natural way to say it: [corrected wording]
>
> Why: [brief explanation in the support language]

## Mnema cards

Generating a lesson does not automatically change the user's Mnema collection. If the user explicitly asks to add lesson vocabulary to Mnema, follow the repository's `AGENTS.md`: confirm the study context and deck, check for duplicates across the context, preserve all existing card content and review metadata, and write the requested cards directly to the appropriate JSON file.
