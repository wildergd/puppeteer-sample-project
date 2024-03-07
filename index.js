const puppeteer = require('puppeteer');

const { TODOIST_EMAIL_ADDRESS, TODOIST_PASSWORD } = process.env;

const waitForDOMToSettle = (page, timeoutMs = 30000, debounceMs = 1000) =>
    page.evaluate(
        (timeoutMs, debounceMs) => {
            let debounce = (func, ms = 1000) => {
                let timeout;
                return (...args) => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => {
                        func.apply(this, args);
                    }, ms);
                };
            };
            return new Promise((resolve, reject) => {
                let mainTimeout = setTimeout(() => {
                    observer.disconnect();
                    reject(new Error("Timed out"));
                }, timeoutMs);

                let debouncedResolve = debounce(async () => {
                    observer.disconnect();
                    clearTimeout(mainTimeout);
                    resolve();
                }, debounceMs);

                const observer = new MutationObserver(() => {
                    debouncedResolve();
                });
                const config = {
                    attributes: true,
                    childList: true,
                    subtree: true,
                };
                observer.observe(document.body, config);
            });
        },
        timeoutMs,
        debounceMs
    );

const clickButton = async (page, buttonSelector) => page.$eval(
    buttonSelector,
    (element) => element.click()
);

const addTask = async (page, taskName) => {
    console.log(`Adding task: "${taskName}"`);
    try {
        await page.type('form.task_editor div[role="textbox"]', taskName);
        await clickButton(page, 'form.task_editor button[aria-label="Add task"]');
        await waitForDOMToSettle(page);
        console.log(`Task "${taskName}" added`);
    } catch (error) {
        console.log(`Something failed when adding task "${taskName}": ${error.message}`);
    }
};

(async () => {
    const browser = await puppeteer.launch({
        product: 'firefox',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
        ],
        headless: "new",
    });
    console.log('getting trello tasks...');
    const page = await browser.newPage();
    await page.goto('https://trello.com/b/QvHVksDa/personal-work-goals', {
        waitUntil: 'domcontentloaded'
    });
    await page.setViewport({width: 1920, height: 708});
    await waitForDOMToSettle(page);
    const tasks = await page.$$eval(
        '[data-testid="trello-card"] a[data-testid="card-name"]',
        (nodes) => nodes.map((n) => n.innerText)
    );

    console.log(`Tasks found: ${tasks.join(', ')}`);

    // Todoist
    console.log('Login int Todoist...');
    // const page = await browser.newPage();
    await page.goto("https://app.todoist.com/auth/login", {
        waitUntil: "domcontentloaded",
    });
    await page.setViewport({width: 1920, height: 708});
    await waitForDOMToSettle(page);
    await page.type(
        '#todoist_app form input[type="email"]',
        TODOIST_EMAIL_ADDRESS
    );

    await page.type('#todoist_app form input[type="password"]', TODOIST_PASSWORD);
    await clickButton(page, 'button[type="submit"]');
    await page.waitForNavigation();
    await waitForDOMToSettle(page);

    console.log('Adding tasks to Todoist...');

    if (tasks.length > 0) {
        await clickButton(page, 'button.plus_add_button');

        await tasks.slice(0, 5).reduce(
            async (prevPromise, taskName) => {
                await prevPromise;
                return addTask(page, taskName);
            },
            Promise.resolve(),
        );

        await clickButton(page, 'form.task_editor button[aria-label="Cancel"]');
    }

    console.log(`Finished`);

    await browser.close();
})();
