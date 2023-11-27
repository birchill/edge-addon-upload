# edge-addon-upload

GitHub Action to upload a Web Extension package to the
Microsoft Edge Add-ons store.

## Usage

See [action.yml](action.yml)

<!-- start usage -->

```yaml
- uses: birchill/edge-addon-upload@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    access_token_url: ${{ secrets.EDGE_ACCESS_TOKEN_URL }}
    addon_file: addon.zip
    client_id: ${{ secrets.EDGE_CLIENT_ID }}
    client_secret: ${{ secrets.EDGE_CLIENT_SECRET }}
    product_id: ${{ secrets.EDGE_PRODUCT_ID }}
```

<!-- end usage -->

## Inputs

- `access_token_url` (required) - The access token URL from
  https://partner.microsoft.com/en-us/dashboard/microsoftedge/publishapi

- `addon_file` (required) - The filename of the addon asset relative to
  `$GITHUB_WORKSPACE`.

- `client_id` (required) - The client ID listed at
  https://partner.microsoft.com/en-us/dashboard/microsoftedge/publishapi

- `client_secret` (required) - A secret generated from
  https://partner.microsoft.com/en-us/dashboard/microsoftedge/publishapi

- `product_id` (required) - The product ID listed under the "Extension identity"
  section of the Partner Center dashboard
