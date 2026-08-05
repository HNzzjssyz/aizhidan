from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    page.goto('http://localhost:8080/语音制单-剪贴板通信版.html')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1000)

    page.screenshot(path='/tmp/test_01_initial.png', full_page=True)
    print("Screenshot 1: Initial page loaded")

    mock_btn = page.locator('button:has-text("模拟对话")')
    if mock_btn.count() > 0:
        mock_btn.first.click()
        page.wait_for_timeout(500)
        page.screenshot(path='/tmp/test_02_mock_mode.png', full_page=True)
        print("Screenshot 2: Mock mode activated")
    else:
        print("ERROR: Mock button not found")

    sample_btn = page.locator('span.quick-sample:has-text("6产品订单")')
    if sample_btn.count() > 0:
        sample_btn.first.click()
        page.wait_for_timeout(1500)
        page.screenshot(path='/tmp/test_03_sample_clicked.png', full_page=True)
        print("Screenshot 3: 6-product sample clicked, chat response visible")
    else:
        print("ERROR: Quick sample button not found")

    copy_btn = page.locator('div:has-text("点击复制 JSON")')
    if copy_btn.count() > 0:
        copy_btn.first.click()
        page.wait_for_timeout(2000)
        page.screenshot(path='/tmp/test_04_after_copy.png', full_page=True)
        print("Screenshot 4: After clicking copy JSON button")
    else:
        print("ERROR: Copy JSON button not found, trying manual copy...")
        pre = page.locator('pre')
        if pre.count() > 0:
            pre.first.click()
            page.keyboard.press('Control+a')
            page.keyboard.press('Control+c')
            page.wait_for_timeout(2000)
            page.screenshot(path='/tmp/test_04_manual_copy.png', full_page=True)
            print("Screenshot 4: After manual copy")
        else:
            print("ERROR: No pre element found either")

    product_items = page.locator('.product-item')
    confirmed = product_items.locator('.product-status.confirmed')
    pending = product_items.locator('.product-status.pending')
    error = product_items.locator('.product-status.error')

    print(f"\nProduct status counts:")
    print(f"  Confirmed (green): {confirmed.count()}")
    print(f"  Pending (yellow): {pending.count()}")
    print(f"  Error (red): {error.count()}")
    print(f"  Total products: {product_items.count()}")

    for i in range(product_items.count()):
        item = product_items.nth(i)
        name = item.locator('.product-name').first.text_content() if item.locator('.product-name').count() > 0 else "N/A"
        status = item.locator('.product-status').first.text_content() if item.locator('.product-status').count() > 0 else "N/A"
        css_class = item.get_attribute('class') or ''
        print(f"  Product {i+1}: {name} - Status: {status} - Class: {css_class}")

    customer_name = page.locator('#customerName')
    if customer_name.count() > 0:
        print(f"\nCustomer: {customer_name.first.text_content()}")

    clipboard_status = page.locator('#clipboardStatus')
    if clipboard_status.count() > 0:
        print(f"Clipboard status: {clipboard_status.first.text_content()}")

    browser.close()
    print("\nTest complete!")
