const express = require("express");
const app = express();
const port = 3000;
const AWS = require("aws-sdk");
const { S3Client } = require("@aws-sdk/client-s3");
const multerS3 = require("multer-s3");
const multer = require("multer");
require("dotenv/config");

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(express.json());

app.use("/static", express.static("public"));

// config dynamo DB
const tableName = "products";
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// config S3
var s3 = new AWS.S3();
const bucketsName = process.env.AWS_BUCKETS_S3_NAME;
const s3Client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION,
});

const maxSize = 1024 * 1024 * 10;
const upload = multer({
  storage: multerS3({
    s3: s3Client,
    acl: "public-read-write",
    bucket: bucketsName,
    key: function (req, file, cb) {
      const fileName = `${new Date().getTime()}.${file.mimetype.split("/")[1]}`;
      cb(null, fileName); //use Date.now() for unique file keys
    },
  }),
  limits: { fileSize: maxSize },
});

app.get("/", async (req, res, next) => {
  const products = await getAll();
  // console.log(products)
  res.render("index", {
    result: { products: products || [] },
  });
});

// create user
app.post("/", upload.single("avatar"), async (req, res, next) => {
  const { name, dayOfBirth, className } = req.body;
  const id = String(new Date().getTime());
  const avatar = req.file?.location;
  await addObject({ id, name, dayOfBirth, className, avatar });
  res.redirect("/");
});

app.post(
  "/products/update",
  upload.single("avatar"),
  async (req, res, next) => {
    const { id, name, dayOfBirth, className } = req.body;
    let avatar = req.file?.location;
    const object = await getById(id);
    if (avatar && object && object.avatar) {
      await deleteFileS3ByLink(object.avatar);
    } else {
      avatar = object.avatar;
    }
    await addObject({ id, name, dayOfBirth, className, avatar });
    res.redirect("/");
  }
);
// get by ID
app.get("/products/update/:id", async (req, res, next) => {
  const { id } = req.params;
  let object;
  try {
    object = await getById(id);
    if (!object) throw new Error();
  } catch (error) {
    res.redirect("/");
    return;
  }
  res.render("update", {
    product: object,
  });
});

app.post("/products/delete/:id", async (req, res, next) => {
  const { id } = req.params;
  try {
    const object = await getById(id);
    if (object) {
      await deleteObject(id);
      object.avatar && (await deleteFileS3ByLink(object.avatar));
    }
  } catch (error) {
    console.log(error);
  }
  res.redirect("/");
});

app.listen(port, () => console.log(`Server start on http://localhost:${port}`));

// service
const addObject = async (entity) => {
  const params = {
    TableName: tableName,
    Item: {
      ...entity,
    },
  };
  const data = await dynamoDB.put(params).promise();
  return { ...data };
};
const deleteObject = async (id) => {
  const params = {
    TableName: tableName,
    Key: {
      id,
    },
  };
  return await dynamoDB.delete(params).promise();
};
const getById = async (id) => {
  const params = {
    TableName: tableName,
    Key: {
      id,
    },
  };
  const data = await dynamoDB.get(params).promise();
  return data.Item && data.Item;
};
const getAll = async () => {
  const params = {
    TableName: tableName,
  };
  const data = await dynamoDB.scan(params).promise();
  return data.Items;
};
const deleteFileS3ByLink = async (linkFile) => {
  try {
    const fileName = linkFile.split("/").pop();
    await s3
      .deleteObject({
        Bucket: bucketsName,
        Key: fileName,
      })
      .promise();
    console.log("delete success file " + fileName);
  } catch (error) {
    // console.log(error);
  }
};

// root-admin,,AKIAVAPKPYPKT4A7V6Y2,YlXPGMtaIdeAe2+gLsGmJI5KKREY4hPj0v4cnpI4,https://344626021333.signin.aws.amazon.com/console
