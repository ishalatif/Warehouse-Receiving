erDiagram
    USERS ||--o{ RECEIVING_DOCUMENTS : "creates"
    RECEIVING_DOCUMENTS ||--|{ RECEIVING_ITEMS : "contains"
    PRODUCTS ||--o{ RECEIVING_ITEMS : "referenced_in"
    PRODUCTS ||--|| INVENTORY : "has_stock"
    PRODUCTS ||--o{ INVENTORY_TRANSACTIONS : "logs_change"
    RECEIVING_DOCUMENTS ||--o{ INVENTORY_TRANSACTIONS : "originates_from"

    USERS {
        int id PK
        string email UK
        string password_hash
        enum role "OPERATOR | SUPERVISOR"
        datetime created_at
    }

    PRODUCTS {
        int id PK
        string sku UK
        string name
        string description
        datetime created_at
        datetime updated_at
    }

    RECEIVING_DOCUMENTS {
        int id PK
        string document_number UK
        enum status "DRAFT | IN_PROGRESS | COMPLETED | CANCELLED"
        int created_by FK
        datetime created_at
        datetime updated_at
    }

    RECEIVING_ITEMS {
        int id PK
        int document_id FK
        int product_id FK
        int expected_quantity
        int received_quantity
    }

    INVENTORY {
        int id PK
        int product_id FK,UK
        int quantity_on_hand
        datetime updated_at
    }

    INVENTORY_TRANSACTIONS {
        int id PK
        int product_id FK
        int document_id FK
        int quantity_change
        enum type "RECEIPT_IN"
        datetime created_at
    }