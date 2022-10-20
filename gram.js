const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const path = require('path');
const fs = require('fs');
const PdfExtractor = require('pdf-extractor').PdfExtractor;
const CanvasRenderer = require('pdf-extractor').CanvasRenderer;
const FileWriter = require('pdf-extractor').FileWriter;
require('dotenv').config();

class JPGWriter extends FileWriter {
  getFilePathForPage(page) {
    return super.getPagePath(page.pageNumber, 'png');
  }

  writeCanvasPage(page, viewport, canvas) {
    return this.writeStreamToFile(canvas.jpgStream(), this.getFilePathForPage(page));
  }
}

class JPGCanvasRenderer extends CanvasRenderer {
  getWriters(writerOptions) {
    let writers = super.getWriters(writerOptions);
    writers.push(new JPGWriter(this.outputDir, writerOptions));
    return writers;
  }
}

const pdfExtractor = (url) =>
  new PdfExtractor(url, {
    pdfJs: { disableFontFace: true },
    viewportScale: (width, height) => {
      //dynamic zoom based on rendering a page to a fixed page size
      if (width > height) {
        //landscape: 1100px wide
        return 1100 / width;
      }
      //portrait: 800px wide
      return 800 / width;
    },
    // all the pages
    pageRange: {
      start: 1,
      end: 100,
    },
    JPGCanvasRenderer: JPGCanvasRenderer,
  });

let pageLength = 0;

console.log(process.env.STRING_SESSION);

const stringSession = process.env.STRING_SESSION;

const apiId = proccess.env.API_ID;

const apiHash = proccess.env.API_HASH;

(async () => {
  const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.start();

  client.addEventHandler(async (update) => {
    console.log('Received new Update');

    const chatID = update.message.chatId;

    if (fs.existsSync(`./images/${chatID}`)) {
      fs.rmSync(`./images/${chatID}`, { recursive: true });
    }

    console.log('message: ', update.message);
    // check if the message is a /start command and send a welcome message
    if (update.message.message.startsWith('/start')) {
      client.sendMessage(chatID, {
        message:
          'به ربات تبدیل pdf به عکس خوش آمدید.\n برای کار با بات، میتوانید یک فایل pdf را به بات ارسال کنید و منتظر عملیات تبدیل و ارسال عکس باشید.',
      });
    }

    // check if the message is a document and if it is a pdf file
    if (update.message?.media && update.message?.media?.document.mimeType === 'application/pdf') {
      console.log('Got the PDF file');

      const pdfData = await client.downloadMedia(update.message.media, {
        workers: 5,
      });

      const chatFolderID = `./images/${chatID}`;

      const fileId = update.message.document.id.value;

      if (!fs.existsSync(chatFolderID)) {
        fs.mkdir(path.join('./images/', `${chatID}`), (err) => {
          if (err) {
            return console.error('error create folder: ', err);
          }
          console.log('Directory created successfully!');
        });
      }

      await fs.writeFileSync(`./images/${chatID}/pdfData.pdf`, pdfData);

      try {
        client.sendMessage(update.message.chatId, {
          message: 'درحال تبدیل pdf به عکس...',
        });

        await pdfExtractor(`./images/${chatID}`)
          .parse(`./images/${chatID}/pdfData.pdf`)
          .then((res) => {
            pageLength = res.jsonData.numpages;

            console.log('# End of Document - done');
          })
          .catch(function (err) {
            console.error('Error: ' + err);
          });
        client.editMessage(update.message.chatId, update.message.id.messageLocalId, {
          postMessage: 'تبدیل با موفقیت انجام شد',
        });
      } catch (error) {
        console.log(error);
      }

      const files = fs.readdirSync(chatFolderID).filter((file) => file.endsWith('.png'));

      // sort files by name
      const sortedFiles = files.sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });

      console.log('sortedFiles: ', sortedFiles);
      for (const file of sortedFiles) {
        console.log({ file });

        await client.sendFile(chatID, {
          file: `./images/${chatID}/${file}`,
        });
      }
    }
  });
})();
