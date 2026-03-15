import { Document, Query } from 'mongoose';

interface QueryParams {
  page?: string;
  limit?: string;
  sort?: string;
  fields?: string;
  [key: string]: string | number | undefined;
}

class QueryFind<T extends Document> {
  query: Query<T[], T>;
  queryString: QueryParams;

  constructor(query: Query<T[], T>, queryString: QueryParams) {
    this.query = query;
    this.queryString = queryString;
  }

  filter(): this {
    const queryObj: Record<string, unknown> = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach((el) => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(
      /\b(eq|ne|gt|gte|lt|lte|in|nin|regex|exists|all|size|elemMatch|type|mod|not|and|or|nor|text|where|geoWithin|geoIntersects|near|nearSphere|expr|jsonSchema|bitsAllClear|bitsAllSet|bitsAnyClear|bitsAnySet|rand)\b/g,
      (match) => `$${match}`,
    );
    this.query = this.query.find(JSON.parse(queryStr));

    return this;
  }

  sort(): this {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }

    return this;
  }

  limitFields(): this {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select('-__v');
    }

    return this;
  }

  paginate(): this {
    const page = parseInt(this.queryString.page || '1', 10);
    const limit = parseInt(this.queryString.limit || '100', 10);
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);

    return this;
  }
}

export default QueryFind;

// Ref
// new QueryFind(ProductModel.find(), query)
//   .filter()
//   .sort()
//   .limitFields()
//   .paginate();
