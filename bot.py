from aiogram import Bot, Dispatcher, types
from aiogram.utils import executor

# 🔹 Замени эти данные на свои
BOT_TOKEN = "8144352720:AAHSDUaIincHvEH2YEAoU5_yl32r-H2_uzs"  # возьми в BotFather
WEBAPP_URL = "https://yusufabduvaliev09.github.io/AbuCargo/registration.html"  # твоя страница на GitHub Pages

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(bot)

@dp.message_handler(commands=['start'])
async def start(message: types.Message):
    keyboard = types.InlineKeyboardMarkup()
    webapp_button = types.InlineKeyboardButton(
        text="📝 Пройти регистрацию",
        web_app=types.WebAppInfo(url=WEBAPP_URL)
    )
    keyboard.add(webapp_button)
    await message.answer(
        f"Привет, {message.from_user.first_name}! 👋\n"
        "Нажми кнопку ниже, чтобы пройти регистрацию:",
        reply_markup=keyboard
    )

# Запуск
if __name__ == "__main__":
    executor.start_polling(dp, skip_updates=True)
