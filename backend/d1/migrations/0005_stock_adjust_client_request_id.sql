ALTER TABLE stock_history ADD COLUMN client_request_id TEXT;
CREATE UNIQUE INDEX stock_history_client_request_id_idx ON stock_history (client_request_id);
