-- Street Coins: riposizionamento delle 10 monete sui musei mappati in OpenStreetMap a Trento.
-- Aggiorna esclusivamente latitude e longitude: codici, nomi, immagini, colori e raccolte restano invariati.
-- Coordinate dei centroidi/feature OSM; tre sedi ricevono una seconda moneta in un punto vicino per evitare sovrapposizioni.

BEGIN;

DO $$
DECLARE
  total_coins integer;
  updated_rows integer;
BEGIN
  SELECT count(*) INTO total_coins FROM public.coins;
  IF total_coins <> 10 THEN
    RAISE EXCEPTION 'Operazione annullata: nel database risultano % monete invece di 10.', total_coins;
  END IF;

  UPDATE public.coins AS c
  SET latitude = p.latitude,
      longitude = p.longitude
  FROM (VALUES
    ('TR-001', 46.067480::double precision, 11.121880::double precision), -- Museo Diocesano Tridentino
    ('TR-002', 46.071420::double precision, 11.126480::double precision), -- Museo del Castello del Buonconsiglio
    ('TR-003', 46.062610::double precision, 11.114730::double precision), -- MUSE
    ('TR-004', 46.020870::double precision, 11.126960::double precision), -- Museo dell'Aeronautica Gianni Caproni
    ('TR-005', 46.063170::double precision, 11.113770::double precision), -- Palazzo delle Albere
    ('TR-006', 46.101950::double precision, 11.095270::double precision), -- TtrAM
    ('TR-007', 46.112200::double precision, 11.117210::double precision), -- Moser in museo
    ('TR-008', 46.067780::double precision, 11.121880::double precision), -- vicino al Museo Diocesano
    ('TR-009', 46.071720::double precision, 11.126480::double precision), -- vicino al Castello
    ('TR-010', 46.062910::double precision, 11.114730::double precision)  -- vicino al MUSE
  ) AS p(code, latitude, longitude)
  WHERE c.code = p.code;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 10 THEN
    RAISE EXCEPTION 'Operazione annullata: aggiornate % righe invece di 10. Verifica i codici TR-001…TR-010.', updated_rows;
  END IF;
END $$;

COMMIT;

-- Verifica finale
SELECT code, name, latitude, longitude
FROM public.coins
ORDER BY code;
