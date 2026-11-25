CREATE TABLE "StoredFile" (
  "id" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoredFile_size_check" CHECK (octet_length("data") BETWEEN 1 AND 5242880)
);
