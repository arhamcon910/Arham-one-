# ARHAM OS Enterprise Database Blueprint

Version: 1.0

---

# Purpose

This document defines the enterprise database standards for ARHAM OS.

All Platform Core modules, Shared Services and Business Products MUST follow these standards.

---

# Database Engine

PostgreSQL 17

ORM:
Prisma 7

---

# Primary Key Strategy

Every table uses UUID as the primary key.

Field name:

id

---

# Standard Audit Fields

Every business entity should contain:

id
createdAt
updatedAt
createdBy
updatedBy

---

# Multi-Tenant Rule

Every business table must contain:

organizationId

unless it is a global system table.

---

# Soft Delete Rule

Business tables should support:

deletedAt

instead of physical deletion.

---

# Active Status

Business entities should contain:

isActive

---

# Naming Convention

Tables:
PascalCase

Columns:
camelCase

Foreign Keys:
entityNameId

Examples:

organizationId

createdBy

updatedBy

---

# Timestamp Standard

createdAt

updatedAt

Timezone:
UTC

---

# Platform Core Tables

Organization

User

Role

Permission

UserRole

AuditLog

SystemSetting

---

# Shared Service Tables

Document

Notification

Task

Comment

File

Tag

Workflow

---

# AI Tables

Prompt

Knowledge

Memory

Conversation

Embedding

AIAgent

---

# Business Products

LABOS

Finance

HRMS

CRM

Inventory

Hospital

Legal

Retail

Construction

Research

---

# Database Principles

Build Once.

Reuse Everywhere.

AI Ready.

Cloud First.

Multi Tenant.

Auditable.

Secure.

Scalable.