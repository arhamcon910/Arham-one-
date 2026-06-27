
# ADR-001 — Platform Core First

## Status

Accepted

---

## Date

2026-06-27

---

## Context

ARHAM ONE will contain multiple Business Operating Systems including:

* ResearchOS
* LegalOS
* HospitalOS
* FinanceOS
* ConstructionOS
* TextileOS
* RetailOS
* LogisticsOS
* and future modules.

Developing every module independently would duplicate authentication, AI, workflow, notifications, storage, reporting and many other common services.

---

## Decision

ARHAM ONE will adopt a Platform Core architecture.

Platform Core will own every reusable capability.

Business OS modules will contain only industry-specific business logic.

---

## Consequences

Advantages

* Single codebase for shared services
* Easier maintenance
* Faster development
* Consistent security
* Unified AI
* Independent deployment of Business OS modules

Trade-offs

* Higher initial architecture effort
* Strong module boundaries required
* Shared services must maintain backward compatibility

---

## Principle

Build Once.

Deploy Anywhere.

Extend Forever.
