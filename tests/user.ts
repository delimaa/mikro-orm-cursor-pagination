import { Entity, ManyToOne, PrimaryKey, Property, Ref } from '@mikro-orm/core';

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Property()
  age!: number;

  // Relationship setup using `Ref` type
  @ManyToOne(() => User, { nullable: true, ref: true })
  parent1?: Ref<User>;

  // Relationship setup without `Ref` type
  @ManyToOne(() => User, { nullable: true })
  parent2?: User;

  constructor(props: Partial<User> = {}) {
    Object.assign(this, props);
  }
}
