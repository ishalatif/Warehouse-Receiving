flowchart TD
    U[Supervisor / Operator] -->|HTTPS JSON request + JWT| FE[Next.js frontend]
    FE -->|REST API| API[Express API]
    API --> AUTH[JWT authentication]
    AUTH --> RBAC[Role authorization]
    RBAC --> VALID[Request and business validation]
    VALID --> SVC[Receiving / product service]
    SVC -->|Parameterized SQL| DB[(PostgreSQL)]

    SVC -->|Create product + zero inventory| DB
    SVC -->|Create DRAFT document + items| DB

    SVC -->|BEGIN; lock document/items| TX[Database transaction]
    TX -->|Validate remaining quantities| CHECK{All items valid?}
    CHECK -->|No| ROLLBACK[ROLLBACK]
    CHECK -->|Yes| UPDATE[Update received quantities]
    UPDATE --> STOCK[Increment inventory]
    STOCK --> LEDGER[Append inventory transaction rows]
    LEDGER --> STATUS[Set IN_PROGRESS or COMPLETED]
    STATUS --> COMMIT[COMMIT]
    ROLLBACK --> ERR[Structured API error]
    COMMIT --> RESP[Success response]
    ERR --> FE
    RESP --> FE

    FE -->|Read catalog, documents, stock, ledger| API
    API -->|Read-only queries| DB
