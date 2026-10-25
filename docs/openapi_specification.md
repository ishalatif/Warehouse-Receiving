openapi: 3.0.3
info:
  title: Warehouse Receiving System API
  version: 1.1.0
  description: >-
    REST API untuk katalog produk, dokumen penerimaan, stok, dan ledger.
    RBAC dan aturan bisnis ditegakkan di backend.
servers:
  - url: http://localhost:5000
    description: Local Docker Compose
tags:
  - name: Health
  - name: Auth
  - name: Products
  - name: Receiving documents
  - name: Inventory
paths:
  /api/health:
    get:
      tags: [Health]
      summary: Periksa kesiapan aplikasi dan database
      responses:
        '200':
          description: Aplikasi siap menerima request
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Health'
        '503':
          description: Aplikasi belum siap
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /api/auth/login:
    post:
      tags: [Auth]
      summary: Login dan terbitkan JWT
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password]
              properties:
                email:
                  type: string
                  format: email
                  maxLength: 255
                password:
                  type: string
                  minLength: 1
                  writeOnly: true
      responses:
        '200':
          description: Login berhasil
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                    enum: [true]
                  data:
                    type: object
                    required: [token, user]
                    properties:
                      token:
                        type: string
                        description: JWT; berlaku sesuai konfigurasi server.
                      user:
                        $ref: '#/components/schemas/User'
        '400':
          description: Bentuk input tidak valid
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '401':
          description: Kredensial tidak valid
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /api/products:
    get:
      tags: [Products]
      summary: Lihat katalog produk
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Katalog produk
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                    enum: [true]
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Product'
        '401':
          $ref: '#/components/responses/Unauthorized'
    post:
      tags: [Products]
      summary: Tambah produk (Supervisor)
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [sku, name]
              properties:
                sku:
                  type: string
                  minLength: 1
                  maxLength: 100
                name:
                  type: string
                  minLength: 1
                  maxLength: 255
                description:
                  type: string
                  nullable: true
      responses:
        '201':
          description: Produk dibuat dengan stok awal nol
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                    enum: [true]
                  data:
                    $ref: '#/components/schemas/Product'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          description: SKU sudah digunakan
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /api/receiving-documents:
    get:
      tags: [Receiving documents]
      summary: Lihat daftar dokumen penerimaan
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Daftar dokumen
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                    enum: [true]
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/ReceivingDocument'
        '401':
          $ref: '#/components/responses/Unauthorized'
    post:
      tags: [Receiving documents]
      summary: Buat dokumen penerimaan (Supervisor)
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [document_number, items]
              properties:
                document_number:
                  type: string
                  minLength: 1
                  maxLength: 100
                items:
                  type: array
                  minItems: 1
                  items:
                    type: object
                    required: [product_id, expected_quantity]
                    properties:
                      product_id:
                        type: integer
                        minimum: 1
                      expected_quantity:
                        type: integer
                        minimum: 1
      responses:
        '201':
          description: Dokumen dibuat dengan status DRAFT
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                    enum: [true]
                  data:
                    $ref: '#/components/schemas/ReceivingDocumentDetail'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: Produk tidak ditemukan
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: Nomor dokumen duplikat
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /api/receiving-documents/{id}:
    parameters:
      - $ref: '#/components/parameters/ResourceId'
    get:
      tags: [Receiving documents]
      summary: Lihat detail dokumen dan item
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Detail dokumen
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                    enum: [true]
                  data:
                    $ref: '#/components/schemas/ReceivingDocumentDetail'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'

  /api/receiving-documents/{id}/receive:
    parameters:
      - $ref: '#/components/parameters/ResourceId'
    post:
      tags: [Receiving documents]
      summary: Catat penerimaan (Operator)
      description: >-
        Semua item divalidasi dan diproses dalam satu transaksi. Jika satu item
        gagal, tidak ada item, stok, ledger, atau status yang berubah.
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [items]
              properties:
                items:
                  type: array
                  minItems: 1
                  items:
                    type: object
                    required: [product_id, quantity_received]
                    properties:
                      product_id:
                        type: integer
                        minimum: 1
                      quantity_received:
                        type: integer
                        minimum: 1
                  description: Setiap product_id hanya boleh muncul sekali.
      responses:
        '200':
          description: Penerimaan berhasil dicatat
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                    enum: [true]
                  data:
                    $ref: '#/components/schemas/ReceivingDocumentDetail'
        '400':
          description: Input tidak valid, over-receiving, produk bukan item dokumen, atau status tertutup
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'

  /api/receiving-documents/{id}/cancel:
    parameters:
      - $ref: '#/components/parameters/ResourceId'
    post:
      tags: [Receiving documents]
      summary: Batalkan dokumen DRAFT (Supervisor)
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Dokumen dibatalkan
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                    enum: [true]
                  data:
                    $ref: '#/components/schemas/ReceivingDocumentDetail'
        '400':
          description: Dokumen bukan berstatus DRAFT
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'

  /api/inventory:
    get:
      tags: [Inventory]
      summary: Lihat saldo stok
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Saldo per produk
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                    enum: [true]
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/InventoryItem'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /api/inventory/transactions:
    get:
      tags: [Inventory]
      summary: Lihat riwayat transaksi stok
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Ledger transaksi penerimaan
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                    enum: [true]
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/InventoryTransaction'
        '401':
          $ref: '#/components/responses/Unauthorized'

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  parameters:
    ResourceId:
      name: id
      in: path
      required: true
      description: ID resource bilangan bulat positif
      schema:
        type: integer
        minimum: 1
  responses:
    BadRequest:
      description: Payload tidak valid atau aturan bisnis dilanggar
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    Unauthorized:
      description: Token tidak ada, tidak valid, atau kedaluwarsa
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    Forbidden:
      description: Role tidak diizinkan melakukan operasi ini
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    NotFound:
      description: Resource tidak ditemukan
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
  schemas:
    Error:
      type: object
      required: [success, code, message]
      properties:
        success:
          type: boolean
          enum: [false]
        code:
          type: string
          example: OVER_RECEIVING_EXCEEDED
        message:
          type: string
          example: Jumlah diterima melebihi sisa kuantitas yang diharapkan.
    Health:
      type: object
      required: [status, database]
      properties:
        status:
          type: string
          enum: [ok]
        database:
          type: string
          enum: [ready]
    User:
      type: object
      required: [id, email, role]
      properties:
        id:
          type: integer
        email:
          type: string
          format: email
        role:
          type: string
          enum: [OPERATOR, SUPERVISOR]
    Product:
      type: object
      required: [id, sku, name, created_at, updated_at]
      properties:
        id:
          type: integer
        sku:
          type: string
        name:
          type: string
        description:
          type: string
          nullable: true
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
    ReceivingDocument:
      type: object
      required: [id, document_number, status, created_by, created_at, updated_at]
      properties:
        id:
          type: integer
        document_number:
          type: string
        status:
          type: string
          enum: [DRAFT, IN_PROGRESS, COMPLETED, CANCELLED]
        created_by:
          type: integer
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
    ReceivingDocumentDetail:
      allOf:
        - $ref: '#/components/schemas/ReceivingDocument'
        - type: object
          required: [items]
          properties:
            items:
              type: array
              items:
                type: object
                required: [product_id, sku, product_name, expected_quantity, received_quantity]
                properties:
                  product_id:
                    type: integer
                  sku:
                    type: string
                  product_name:
                    type: string
                  expected_quantity:
                    type: integer
                  received_quantity:
                    type: integer
    InventoryItem:
      type: object
      required: [product_id, sku, product_name, quantity_on_hand, updated_at]
      properties:
        product_id:
          type: integer
        sku:
          type: string
        product_name:
          type: string
        quantity_on_hand:
          type: integer
          minimum: 0
        updated_at:
          type: string
          format: date-time
    InventoryTransaction:
      type: object
      required: [id, product_id, document_id, quantity_change, type, created_at]
      properties:
        id:
          type: integer
        product_id:
          type: integer
        document_id:
          type: integer
        quantity_change:
          type: integer
          minimum: 1
        type:
          type: string
          enum: [RECEIPT_IN]
        created_at:
          type: string
          format: date-time
