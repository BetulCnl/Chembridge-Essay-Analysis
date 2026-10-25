# Yeni kaynak nasıl eklenir

## En kolay yol: yeni bir RSS/Atom akışı ya da dergi

Kod yazmak gerekmez.

- **RSS/Atom akışı** → `packages/pipeline/config/pipeline.json` içinde `sources.rss.feeds` listesine
  bir satır ekle:

  ```json
  {
    "id": "jacs-asap",
    "name": "JACS ASAP",
    "url": "https://…",
    "type": "article",
    "chemistry": true
  }
  ```

  `type`: `article` veya `news`; `chemistry: false` ise kayıt ancak birden fazla kimya terimi içerdiğinde
  yayımlanır.

- **Crossref'te kayıtlı bir dergi** → `sources["crossref-journals"].journals` listesine ISSN ekle.
  ISSN'i önce doğrula: `curl https://api.crossref.org/journals/<ISSN>`.

Sonra çalıştır:

```bash
pnpm pipeline probe                      # akış/robots/yanıt kontrolü
pnpm pipeline collect --sources=rss --days=7
pnpm pipeline stats
```

Web arayüzünde görünen adı `apps/web/src/lib/labels.ts` → `SOURCE_NAMES` içine ekle
(`rss:<id>` anahtarıyla).

## Yeni bir API bağlayıcısı

1. **Doğrula ve belgeleyin.** Uç noktayı, anahtar gereksinimini, resmi rate limit'i ve kullanım
   şartlarını kontrol et; `docs/SOURCES.md` tablosuna bir satır ekle. Tahmine dayalı URL kullanma.
   Bot koruması (Cloudflare/WAF) döndüren kaynakları atla.
2. **Yapılandırma.** `config/pipeline.json` içine `sources.<id>` ekle ve aynı alanı
   `src/config.ts` içindeki Zod şemasına tanımla.
3. **İstek politikası.** `src/connectors/types.ts` → `POLICIES` içine kaynağın resmi limitine uyan bir
   giriş ekle (`minIntervalMs`, `timeoutMs`, `retries`, gerekirse `maxRetryAfterMs`). Hız sınırı host
   başına uygulanır; aynı host'u paylaşan kaynaklar ortak bütçe kullanır.
4. **Bağlayıcı.** `src/connectors/<id>.ts`:

   ```ts
   import { finalizeDraft, isCreativeCommons, type DraftDevelopment } from '../normalize.ts';
   import { POLICIES, type Connector } from './types.ts';

   /** Saf fonksiyon: ham yanıt → taslak kayıtlar. Fixture testleri bunu çağırır. */
   export function parseExample(
     json: ExampleResponse,
     opts: { sourceUrl: string; fetchedAt: string },
   ): DraftDevelopment[] {
     return json.items.map((r) => ({
       source: 'example',
       nativeId: r.id,
       sourceUrl: opts.sourceUrl,
       fetchedAt: opts.fetchedAt,
       title: r.title,
       abstract: r.abstract,
       authors: r.authors,
       publishedAt: r.date, // YYYY-MM-DD
       type: 'preprint',
       venue: 'Example',
       url: r.url,
       doi: r.doi,
       license: r.license,
       chemistrySource: true,
       // Lisans yeniden dağıtıma izin vermiyorsa yalnızca 600 karakterlik alıntı saklanır.
       redistributable: isCreativeCommons(r.license),
     }));
   }

   export const exampleConnector: Connector = {
     id: 'example',
     label: 'Example',
     kind: 'api', // web kaynakları için 'feed' (robots.txt'e tabi)
     supportsBackfill: true,
     enabled: (c) => c.sources.example.enabled,
     async collect(ctx, window) {
       const url = `https://api.example.org/items?from=${window.from}&to=${window.to}`;
       const { data } = await ctx.http.getJson<ExampleResponse>(url, {
         source: 'example',
         policy: POLICIES.example,
       });
       const records = parseExample(data!, { sourceUrl: url, fetchedAt: ctx.now.toISOString() })
         .map(finalizeDraft)
         .filter((d) => d !== undefined);
       return { records, fetched: data?.items.length ?? 0, notModified: false, warnings: [] };
     },
   };
   ```

   `finalizeDraft` kimlik (DOI → arXiv → başlık), kod/veri bağlantıları, anahtar kelimeler ve alıntı
   üretimini halleder; dedup, mevcut kayıtlarla otomatik birleştirir.

5. **Kaydet.** `src/connectors/index.ts` → `CONNECTORS` listesine ekle.
6. **Fixture + test.** `src/stages/probe.ts` → `probeTargets` içine küçük bir istek ekle,
   `pnpm pipeline fixtures:record` ile gerçek yanıtı kaydet ve `test/connectors.test.ts` içine
   ayrıştırma testleri yaz.
7. **Taksonomi ipuçları (isteğe bağlı).** Kaynağın kendi kategorileri varsa (`topics` alanı,
   ör. `example:biochemistry`), `packages/core/rules/taxonomy.json` içindeki ilgili kimya alt
   alanının `hints` nesnesine ağırlıkla ekle.
8. **Dene.** `pnpm pipeline collect --sources=example --days=7 && pnpm pipeline stats`, ardından
   `pnpm test`.

## Kural dosyaları

- `packages/core/rules/taxonomy.json` — kimya × CS alt alanları, eşleşme desenleri, veri setleri,
  yayın yerleri, teknoloji yığınları.
- `packages/core/rules/scoring.json` — skor bileşenleri, puanlar, cezalar ve "potansiyel hücre"
  çıkarım kuralları.
- `packages/core/rules/ideas.json` — Katman A fikir şablonları (TR/EN).

Desenler JavaScript ve Java ile uyumlu düzenli ifadelerdir; bir kural değiştiğinde ilgili `version`
alanını artır. `pnpm test` tüm desenlerin derlendiğini ve başvurulan kimliklerin var olduğunu denetler.
