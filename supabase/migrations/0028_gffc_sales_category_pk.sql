-- The GFFC "Sales by Item" export lists the same item name under different
-- categories, so (year, month, item) is not unique. Key on category too.
alter table public.gffc_monthly_sales drop constraint gffc_monthly_sales_pkey;
alter table public.gffc_monthly_sales add primary key (year, month, category, item);
