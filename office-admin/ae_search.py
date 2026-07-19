#!/usr/bin/env python3
# AliExpress keyword search for the Virtual Office "Майя" agent.
# Reuses the iop SDK (from bivex/aliexpress-product-search, cloned alongside).
# Reads credentials from a JSON config and prints a JSON result to stdout.
#
#   python3 ae_search.py "<keywords>" <max_price>
#
import sys, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
CONFIG = os.environ.get('AE_CONFIG', '/opt/taxi-office/data/ali-config.json')

TITLE_KEYS = ['product_title', 'productTitle', 'title', 'subject', 'name']
URL_KEYS = ['product_detail_url', 'productDetailUrl', 'promotion_link', 'product_url', 'detail_url']
IMG_KEYS = ['product_main_image_url', 'productMainImageUrl', 'image_url', 'imageUrl', 'main_image_url']
PRICE_KEYS = ['target_sale_price', 'app_sale_price', 'sale_price', 'target_app_sale_price',
              'min_price', 'salePrice', 'targetSalePrice', 'origin_price']


def out(obj):
    print(json.dumps(obj, ensure_ascii=False))
    sys.exit(0)


def first(d, keys):
    for k in keys:
        v = d.get(k)
        if v not in (None, '', []):
            return v
    return None


def to_price(d):
    v = first(d, PRICE_KEYS)
    if v is None:
        return None
    try:
        return float(str(v).replace(',', '.').replace('$', '').strip())
    except Exception:
        return None


def collect_products(node, found):
    # recursively find the largest list of dicts that look like products
    if isinstance(node, list):
        dicts = [x for x in node if isinstance(x, dict)]
        if dicts and any(any(k in x for k in TITLE_KEYS) for x in dicts):
            found.append(dicts)
        for x in node:
            collect_products(x, found)
    elif isinstance(node, dict):
        for v in node.values():
            collect_products(v, found)


def main():
    keyword = sys.argv[1] if len(sys.argv) > 1 else 'electronics'
    try:
        max_price = float(sys.argv[2])
    except Exception:
        max_price = 50.0

    try:
        with open(CONFIG) as f:
            cfg = json.load(f)
    except Exception:
        out({'error': 'no_config', 'message': 'AliExpress ещё не настроен (нет файла ключей).'})

    api = cfg.get('api', {})
    loc = cfg.get('locale', {})
    app_key, app_secret, token = api.get('app_key'), api.get('app_secret'), api.get('access_token')
    if not (app_key and app_secret and token):
        out({'error': 'no_keys', 'message': 'Заполните app_key, app_secret и access_token в настройках.'})

    country = (loc.get('ship_to_country') or 'US').upper()
    currency = (loc.get('target_currency') or 'USD').upper()
    language = (loc.get('target_language') or 'EN')
    local = (language.lower() + '_' + country) if len(language) == 2 else 'en_US'

    try:
        import iop
    except Exception as e:
        out({'error': 'no_sdk', 'message': 'SDK iop не найден на сервере: ' + str(e)[:150]})

    try:
        client = iop.IopClient('https://api-sg.aliexpress.com/sync', app_key, app_secret)
        req = iop.IopRequest('aliexpress.ds.text.search')
        req.add_api_param('keyWord', keyword)
        req.add_api_param('countryCode', country)
        req.add_api_param('currency', currency)
        req.add_api_param('local', local)
        req.add_api_param('pageSize', '20')
        req.add_api_param('pageIndex', '1')
        req.add_api_param('sortBy', 'orders,desc')
        resp = client.execute(req, token)
        body = resp.body
    except Exception as e:
        out({'error': 'api_error', 'message': str(e)[:300]})

    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            out({'error': 'bad_body', 'message': str(body)[:300]})

    # surface AliExpress error messages if present
    txt = json.dumps(body)[:400]
    found = []
    collect_products(body, found)
    lists = sorted(found, key=len, reverse=True)
    products = lists[0] if lists else []

    result = []
    for p in products:
        price = to_price(p)
        if price is None or price > max_price:
            continue
        img = first(p, IMG_KEYS)
        if isinstance(img, str) and img.startswith('//'):
            img = 'https:' + img
        result.append({
            'title': first(p, TITLE_KEYS) or 'Товар',
            'price': round(price, 2),
            'currency': currency,
            'url': first(p, URL_KEYS) or '',
            'image': img or '',
        })

    if not result and not products:
        out({'ok': True, 'query': keyword, 'maxPrice': max_price, 'count': 0, 'products': [],
             'note': 'Пусто. Ответ API: ' + txt})
    out({'ok': True, 'query': keyword, 'maxPrice': max_price, 'count': len(result), 'products': result[:20]})


if __name__ == '__main__':
    main()
