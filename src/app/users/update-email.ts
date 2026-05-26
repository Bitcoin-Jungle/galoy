import { UsersRepository } from "@services/mongoose"
import { EmailAlreadyExistsError } from "@domain/errors"
import { ValidationError } from "@domain/errors"

// Regular expression for basic email validation
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export const updateEmail = async ({
  userId,
  email,
}: {
  userId: UserId
  email: string | null
}): Promise<User | ApplicationError> => {
  const usersRepo = UsersRepository()
  
  const user = await usersRepo.findById(userId)
  if (user instanceof Error) return user
  
  // If user already has an email set, prevent changes
  if (user.email) {
    return new ValidationError("Email can only be set once")
  }
  
  // Validate email format if it's not null
  if (email !== null && !EMAIL_REGEX.test(email)) {
    return new ValidationError("Invalid email format")
  }
  
  const updatedUser = {
    ...user,
    email: email as Email,
  }
  
  try {
    return await usersRepo.update(updatedUser)
  } catch (err) {
    // Check for MongoDB duplicate key error (code 11000)
    if (err.name === 'MongoError' && err.code === 11000 && err.keyPattern?.email) {
      return new EmailAlreadyExistsError()
    }
    return err
  }
} 