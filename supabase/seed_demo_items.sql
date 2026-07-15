-- Seed a demo inventory catalogue for the demo org. Run once.
-- quantity_on_hand and weighted_avg_cost are the denormalized stock columns
-- the app maintains from inventory_movements.
insert into items (organization_id, sku, name, unit_of_measure, quantity_on_hand, weighted_avg_cost, low_stock_threshold, default_tax_category)
values
 ('94349aa5-ed47-474f-9a07-c726e63d925f','MIX-01','Concrete Mixer (50KG)','unit', 3, 91000, 2, 'GGST'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','CEM-50','Cement (50kg bag)','bag', 120, 95, 40, 'GGST'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','RBR-12','Steel Rebar 12mm','length', 30, 180, 50, 'GGST'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','PVC-04','PVC Pipe 4"','length', 8, 120, 20, 'GGST'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','WTR-500','Bottled Water 500ml','case', 60, 22, 24, 'GGST'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','FIX-AST','Assorted fixings & tools','set', 12, 358.33, 5, 'GGST'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','SND-M3','Sand','m3', 0, 450, 10, 'GGST'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','GRV-M3','Gravel','m3', 15, 520, 8, 'GGST')
on conflict do nothing;
