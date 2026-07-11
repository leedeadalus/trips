-- Seed data: real trips/flights preserved from the original shared travel.flights table
-- (converted from a single flat flight list into grouped trips for this app's schema).
-- Safe to re-run: truncates and reinserts.

BEGIN;
TRUNCATE TABLE trips.flights RESTART IDENTITY;
TRUNCATE TABLE trips.trips RESTART IDENTITY CASCADE;

INSERT INTO trips.trips (name, description, start_date, end_date) VALUES
  ('Europe Spring Trip 1', 'Preseeded from real travel.flights data', '2026-03-18', '2026-03-26'),
  ('India & Europe Trip', 'Preseeded from real travel.flights data', '2026-04-16', '2026-04-30'),
  ('Montreal Trip', 'Preseeded from real travel.flights data', '2026-05-03', '2026-05-07'),
  ('Europe Spring Trip 2', 'Preseeded from real travel.flights data', '2026-05-18', '2026-05-29'),
  ('US West Coast Trip', 'Preseeded from real travel.flights data', '2026-06-17', '2026-06-26');

-- Trip 1: Europe Spring Trip 1
INSERT INTO trips.flights (trip_id, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime, airline, class, booking_reference, ticket_price, currency, status, notes) VALUES
  (1, 'UA70', 'EWR', 'AMS', '2026-03-18T18:35:00Z', '2026-03-19T07:15:00Z', 'United Airlines', 'Polaris Business', 'H59RC5', 2768.03, 'USD', 'confirmed', 'Seat 05L'),
  (1, 'UA71', 'AMS', 'EWR', '2026-03-26T09:15:00Z', '2026-03-26T12:55:00Z', 'United Airlines', 'Premium Plus', 'H59RC5', NULL, 'USD', 'not_flown', 'Seat 22K; included in H59RC5 booking total'),
  (1, 'OS316', 'AMS', 'VIE', '2026-03-26T17:30:00Z', '2026-03-26T19:20:00Z', 'SWISS/Austrian Airlines', 'Business Flex', 'Z8CK2B', 564.43, 'EUR', 'confirmed', 'Operated by airBaltic on behalf of Austrian Airlines; booked via SWISS');

-- Trip 2: India & Europe Trip
INSERT INTO trips.flights (trip_id, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime, airline, class, booking_reference, ticket_price, currency, status, notes) VALUES
  (2, 'LH1335', 'BUD', 'FRA', '2026-04-16T07:25:00Z', '2026-04-16T09:10:00Z', 'Lufthansa', 'Business', '93JD4X', 2242.48, 'USD', 'confirmed', 'Segment 1 of BUD-BLR; total price HUF 746500'),
  (2, 'LH754', 'FRA', 'BLR', '2026-04-16T10:50:00Z', '2026-04-16T19:50:00Z', 'Lufthansa', 'Business', '93JD4X', NULL, 'USD', 'confirmed', 'Segment 2 of BUD-BLR; included in 93JD4X total'),
  (2, 'LH765', 'BLR', 'MUC', '2026-04-19T20:40:00Z', '2026-04-20T05:55:00Z', 'Lufthansa', 'Business Flex', '7ZNORU', NULL, 'INR', 'not_flown', 'Segment 1 of BLR-FCO; total INR 425668'),
  (2, 'LH4170', 'MUC', 'FCO', '2026-04-20T08:15:00Z', '2026-04-20T09:50:00Z', 'Lufthansa', 'Business Flex', '7ZNORU', NULL, 'INR', 'not_flown', 'Segment 2 of BLR-FCO; operated by Lufthansa City on behalf of Lufthansa'),
  (2, 'EY239', 'BLR', 'AUH', '2026-04-20T16:45:00Z', '2026-04-20T20:35:00Z', 'Etihad Airways', 'Business', '9AUEXK', NULL, 'USD', 'confirmed', 'Seat 03F'),
  (2, 'EY85', 'AUH', 'FCO', '2026-04-20T22:20:00Z', '2026-04-21T05:30:00Z', 'Etihad Airways', 'Business', '9AUEXK', NULL, 'USD', 'confirmed', 'Seat 08A; booking reference 9AUEXK'),
  (2, 'UA509', 'FCO', 'EWR', '2026-04-30T10:55:00Z', '2026-04-30T16:50:00Z', 'United Airlines', 'Polaris Business', 'D1MYV8', 1370.63, 'USD', 'confirmed', 'Seat 02D');

-- Trip 3: Montreal Trip
INSERT INTO trips.flights (trip_id, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime, airline, class, booking_reference, ticket_price, currency, status, notes) VALUES
  (3, 'UA8185', 'LGA', 'YUL', '2026-05-03T15:30:00Z', '2026-05-03T17:07:00Z', 'Air Canada Express', 'Economy', 'FM0S2Q', 530.97, 'USD', 'confirmed', 'Operated by Air Canada Express Jazz; UA booking FM0S2Q'),
  (3, 'AC8640', 'YUL', 'LGA', '2026-05-07T15:30:00Z', '2026-05-07T16:58:00Z', 'Air Canada Express', 'Economy', 'FM0S2Q', NULL, 'USD', 'confirmed', 'Operated by Air Canada Express Jazz; included in FM0S2Q total');

-- Trip 4: Europe Spring Trip 2
INSERT INTO trips.flights (trip_id, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime, airline, class, booking_reference, ticket_price, currency, status, notes) VALUES
  (4, 'UA30', 'EWR', 'MUC', '2026-05-18T17:00:00Z', '2026-05-19T05:10:00Z', 'United Airlines', 'Polaris Business', 'BBK336', 4719.43, 'USD', 'confirmed', 'Seat 07A'),
  (4, 'LH121', 'MUC', 'PRG', '2026-05-21T10:00:00Z', NULL, 'Lufthansa', 'Business', NULL, NULL, 'EUR', 'confirmed', 'Lufthansa Munich to Prague May 21 2026; flight number not extracted from email'),
  (4, 'BA855', 'PRG', 'LHR', '2026-05-27T15:15:00Z', '2026-05-27T17:25:00Z', 'British Airways', 'Economy', 'YSUHZH', NULL, 'CZK', 'confirmed', 'Seat 13F; Euro Traveller; fare CZK 4796'),
  (4, 'UA147', 'LHR', 'EWR', '2026-05-29T11:00:00Z', '2026-05-29T15:20:00Z', 'United Airlines', 'Polaris Business', 'BBK336', NULL, 'USD', 'confirmed', 'Seat 05L; included in BBK336 total');

-- Trip 5: US West Coast Trip
INSERT INTO trips.flights (trip_id, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime, airline, class, booking_reference, ticket_price, currency, status, notes) VALUES
  (5, 'UA1227', 'EWR', 'SFO', '2026-06-17T13:20:00Z', '2026-06-17T16:18:00Z', 'United Airlines', 'Premium Plus', 'LQPHM6', 1064.40, 'USD', 'confirmed', 'Seat 20F'),
  (5, 'UA5437', 'SFO', 'SEA', '2026-06-22T12:10:00Z', '2026-06-22T14:39:00Z', 'United Airlines', 'United First', 'E05MWK', 540.11, 'USD', 'confirmed', 'Seat 02A; operated by SkyWest DBA United Express'),
  (5, 'UA2319', 'SEA', 'LAX', '2026-06-24T08:30:00Z', '2026-06-24T11:18:00Z', 'United Airlines', 'United First', 'JGPMK8', 339.88, 'USD', 'confirmed', 'Seat 01A'),
  (5, 'UA1981', 'LAX', 'EWR', '2026-06-26T11:15:00Z', '2026-06-26T19:30:00Z', 'United Airlines', 'Premium Plus', 'LQTVBT', 1010.01, 'USD', 'confirmed', 'Seat 20F');

COMMIT;
