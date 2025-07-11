let user_info_block = document.getElementById("user").querySelector('span');
let logout = document.getElementById("logout");

chrome.storage.local.get(['user_data', 'webhook_url']).then((res) => {
    const user_info = res.user_data;
    const webhook_url = res.webhook_url;

    if (!webhook_url) {
        alert("Webhook URL не найден. Пожалуйста, вернитесь на страницу авторизации и введите URL.");
        location.href = "/index.html";
        return;
    }

    user_info_block.innerHTML = `${user_info.NAME} ${user_info.LAST_NAME}`;
});

const saveToBitrixBtn = document.getElementById("saveToBitrix");
const loader = document.getElementById("loader");
const status_mess = document.getElementById("status_mess");

logout.addEventListener("click", () => {
    chrome.storage.local.clear(() => {
        location.href = "/index.html";
    });
});

saveToBitrixBtn.addEventListener("click", (e) => {
    loader.style.display = "block";
    status_mess.innerHTML = "";
    e.target.disabled = true;

    // Устанавливаем таймаут на случай, если что-то пойдет не так
    const timeoutId = setTimeout(() => {
        loader.style.display = "none";
        saveToBitrixBtn.disabled = false;
        displayStatus("Превышено время ожидания. Попробуйте еще раз.", 'red');
    }, 30000); // 30 секунд

    chrome.tabs.query({ active: true }, function (tabs) {
        const tab = tabs[0];
        if (tab) {
            execScript2(tab, timeoutId);
        } else {
            clearTimeout(timeoutId);
            loader.style.display = "none";
            saveToBitrixBtn.disabled = false;
            alert("Нет активных вкладок");
        }
    });
});

function execScript2(tab, timeoutId) {
    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        func: () => {
            const show_contact = document.querySelector('[data-qa="response-resume_show-phone-number"]');
            if (show_contact) {
                show_contact.click();
            }
        }
    }).then(() => {
        setTimeout(() => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: false },
                func: getVacancyInfo
            }).then((Resume) => {
                clearTimeout(timeoutId); // Очищаем таймаут при успешном выполнении
                sendToBitrix(Resume[0].result);
            }).catch((error) => {
                clearTimeout(timeoutId);
                console.error('Ошибка при выполнении скрипта:', error);
                loader.style.display = "none";
                saveToBitrixBtn.disabled = false;
                displayStatus('Ошибка при извлечении данных со страницы', 'red');
            });
        }, 3000);
    }).catch((error) => {
        clearTimeout(timeoutId);
        console.error('Ошибка при клике на показать контакты:', error);
        loader.style.display = "none";
        saveToBitrixBtn.disabled = false;
        displayStatus('Ошибка при доступе к странице', 'red');
    });
}

function getVacancyInfo() {
    function currentDate() {
        const currentDate = new Date();
        const day = currentDate.getDate().toString().padStart(2, '0');
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const year = currentDate.getFullYear();
        return `${day}.${month}.${year}`;
    }

    try {
        const vacancy = {};
        const resume = {};

        vacancy.resumeLink = window.location.href;
        vacancy.resumeId = window.location.pathname.split("/")[2] || "";

        // Отладочная информация для resumeId
        console.log('URL страницы:', window.location.href);
        console.log('Путь:', window.location.pathname);
        console.log('Извлеченный resumeId:', vacancy.resumeId);

        const vacancyNameElem = document.querySelector('div[data-qa="resume-history-sidebar-container"] div[data-qa="resume-history-item"] a');
        vacancy.vacancyName = vacancyNameElem ? vacancyNameElem.innerText.trim() : "";

        const commentBlock = document.querySelectorAll('div[data-qa="resume-comments"] div[data-qa="resume-comment-item"]');
        if (commentBlock && commentBlock.length > 0) {
            vacancy.comments = Array.from(commentBlock).map(item => {
                const commentText = item.querySelector('span[data-qa="comment__text"]');
                const commentInfo = item.querySelector('div.resume-sidebar-item__info');
                return (commentText ? commentText.innerText : '') + "\n" +
                       (commentInfo ? commentInfo.innerText : '') + "\n\n";
            }).join("");
        } else {
            vacancy.comments = "";
        }

        // Собираем персональную информацию
        const genderElem = document.querySelector('span[data-qa="resume-personal-gender"]');
        vacancy.gender = genderElem ? genderElem.innerText.trim() : "";

        const ageElem = document.querySelector('span[data-qa="resume-personal-age"]');
        vacancy.age = ageElem ? ageElem.innerText.split(' ')[0] : "";

        const addressElem = document.querySelector('span[data-qa="resume-personal-address"]');
        vacancy.address = addressElem ? addressElem.innerText.trim() : "";

        // Собираем опыт работы
        const experienceTitle = document.querySelector('[data-qa="resume-experience-block-title"] h2');
        let experienceText = experienceTitle ? experienceTitle.innerText.trim() + '\n\n' : '';

        // Находим все блоки опыта работы
        const experienceBlocks = document.querySelectorAll('[data-qa="resume-block-experience-position"]');
        if (experienceBlocks.length > 0) {
            const experienceDetails = Array.from(experienceBlocks).map(block => {
                const position = block.innerText.trim();

                // Ищем компанию (родительский элемент)
                const companyElem = block.closest('.magritte-card___bhGKz_8-0-0')?.querySelector('[data-qa="resume-experience-company-title"]');
                const company = companyElem ? companyElem.innerText.trim() : '';

                // Ищем период работы
                const periodElem = block.closest('.magritte-card___bhGKz_8-0-0')?.querySelector('[data-qa="resume-experience-period"]');
                const period = periodElem ? periodElem.innerText.trim() : '';

                // Ищем описание работы
                const descElem = block.closest('.magritte-card___bhGKz_8-0-0')?.querySelector('[data-qa="resume-block-experience-description"]');
                const description = descElem ? descElem.innerText.trim() : '';

                return `${position} в ${company}\n${period}\n${description}`;
            }).join('\n\n');

            vacancy.experience = experienceText + experienceDetails;
        } else {
            vacancy.experience = experienceText || "";
        }

        // Собираем образование
        const educationTitle = document.querySelector('[data-qa="resume-education-block-title"] h2');
        let educationText = educationTitle ? educationTitle.innerText.trim() + '\n\n' : '';

        // Ищем все блоки образования в карточках
        const educationCards = document.querySelectorAll('.magritte-card___bhGKz_8-0-0');
        let educationDetails = [];

        educationCards.forEach(card => {
            // Проверяем, содержит ли карточка образовательную информацию
            const levelText = card.querySelector('.magritte-text_style-secondary___1IU11_4-0-0');
            if (levelText && (levelText.innerText.includes('Уровень') || levelText.innerText.includes('образование'))) {
                // Это блок с высшим образованием
                const institution = card.querySelector('span')?.innerText.trim();
                const specialty = card.querySelectorAll('.magritte-text_style-secondary___1IU11_4-0-0 span')[0]?.innerText.trim();
                const year = card.querySelector('.magritte-text_style-tertiary___ANX5P_4-0-0')?.innerText.trim();

                if (institution) {
                    educationDetails.push(`${institution}\n${specialty || ''}\n${year || ''}`);
                }
            } else {
                // Проверяем, это ли курсы/дополнительное образование
                const courseTitle = card.querySelector('.magritte-text_style-primary___AQ7MW_4-0-0 span')?.innerText.trim();
                const courseOrg = card.querySelector('.magritte-text_style-secondary___1IU11_4-0-0 span')?.innerText.trim();
                const courseYear = card.querySelector('.magritte-text_style-secondary___1IU11_4-0-0')?.innerText.trim();

                if (courseTitle && courseOrg && !courseTitle.includes('Опыт работы') && !courseTitle.includes('Языки')) {
                    educationDetails.push(`Курс: ${courseTitle}\nОрганизация: ${courseOrg}\n${courseYear || ''}`);
                }
            }
        });

        if (educationDetails.length > 0) {
            vacancy.education = educationText + educationDetails.join('\n\n');
        } else {
            vacancy.education = educationText || "";
        }

        // Собираем ключевые навыки
        const skillsTitle = document.querySelector('[data-qa="resume-skills-block-title"] h2');
        let skillsText = skillsTitle ? skillsTitle.innerText.trim() + '\n\n' : '';

        // Ищем навыки по уровням
        let skillsByLevel = [];

        // Продвинутый уровень
        const advancedTitle = document.querySelector('[data-qa="skill-level-title-3"]');
        if (advancedTitle) {
            const advancedContainer = advancedTitle.closest('.magritte-v-spacing-container___mkW1c_2-0-57');
            const advancedSkills = advancedContainer?.querySelectorAll('.magritte-tag__label___YHV-o_3-1-32 span');
            if (advancedSkills && advancedSkills.length > 0) {
                const skills = Array.from(advancedSkills).map(skill => skill.innerText.trim()).join(', ');
                skillsByLevel.push(`Продвинутый уровень: ${skills}`);
            }
        }

        // Средний уровень
        const mediumTitle = document.querySelector('[data-qa="skill-level-title-2"]');
        if (mediumTitle) {
            const mediumContainer = mediumTitle.closest('.magritte-v-spacing-container___mkW1c_2-0-57');
            const mediumSkills = mediumContainer?.querySelectorAll('.magritte-tag__label___YHV-o_3-1-32 span');
            if (mediumSkills && mediumSkills.length > 0) {
                const skills = Array.from(mediumSkills).map(skill => skill.innerText.trim()).join(', ');
                skillsByLevel.push(`Средний уровень: ${skills}`);
            }
        }

        // Начальный уровень
        const beginnerTitle = document.querySelector('[data-qa="skill-level-title-1"]');
        if (beginnerTitle) {
            const beginnerContainer = beginnerTitle.closest('.magritte-v-spacing-container___mkW1c_2-0-57');
            const beginnerSkills = beginnerContainer?.querySelectorAll('.magritte-tag__label___YHV-o_3-1-32 span');
            if (beginnerSkills && beginnerSkills.length > 0) {
                const skills = Array.from(beginnerSkills).map(skill => skill.innerText.trim()).join(', ');
                skillsByLevel.push(`Начальный уровень: ${skills}`);
            }
        }

        if (skillsByLevel.length > 0) {
            vacancy.skills = skillsText + skillsByLevel.join('\n\n');
        } else {
            // Альтернативный поиск навыков без уровней
            const skillItems = document.querySelectorAll('[data-qa="resume-block-skills-item"]');
            if (skillItems.length > 0) {
                const skills = Array.from(skillItems).map(item => item.innerText.trim()).join(', ');
                vacancy.skills = skillsText + skills;
            } else {
                // Ищем любые навыки в тегах (исключая языки)
                const skillTags = document.querySelectorAll('.magritte-tag__label___YHV-o_3-1-32 span');
                if (skillTags.length > 0) {
                    const tagSkills = Array.from(skillTags).map(tag => tag.innerText.trim()).filter(text =>
                        text && !text.includes('Казахский') && !text.includes('Русский') && !text.includes('Английский') &&
                        !text.includes('Немецкий') && !text.includes('WhatsApp') && !text.includes('Viber') && !text.includes('Telegram')
                    ).join(', ');
                    vacancy.skills = skillsText + tagSkills;
                } else {
                    vacancy.skills = skillsText || "";
                }
            }
        }

        // Собираем желаемую зарплату
        const salaryElem = document.querySelector('[data-qa="resume-salary-expectation"] h2');
        if (salaryElem) {
            vacancy.salary = salaryElem.innerText.trim();
        } else {
            vacancy.salary = "";
        }

        // Собираем желаемую должность
        const positionElem = document.querySelector('[data-qa="resume-position"] h2');
        if (positionElem) {
            vacancy.position = positionElem.innerText.trim();
        } else {
            vacancy.position = "";
        }

        // Собираем языки
        const languageItems = document.querySelectorAll('[data-qa="resume-block-language-item"]');
        if (languageItems.length > 0) {
            vacancy.languages = Array.from(languageItems).map(item => item.innerText.trim()).join(', ');
        } else {
            vacancy.languages = "";
        }

        // Собираем информацию "О кандидате"
        const aboutCandidateBlocks = document.querySelectorAll('.magritte-card___bhGKz_8-0-0');
        let aboutCandidate = '';

        aboutCandidateBlocks.forEach(card => {
            const textContent = card.querySelector('.magritte-text_typography-paragraph-3-regular___tEZmr_4-0-0 span');
            if (textContent && textContent.innerText.length > 100) { // Длинный текст скорее всего "О кандидате"
                aboutCandidate = textContent.innerText.trim();
            }
        });

        vacancy.aboutCandidate = aboutCandidate;

        vacancy.date = currentDate();

        const nameElem = document.querySelector('[data-qa="resume-personal-name"] span');
        if (nameElem) {
            const full_name = nameElem.innerText.trim().split(' ');
            resume.NAME = full_name[1] || "";
            resume.LAST_NAME = full_name[0] || "";
        } else {
            resume.NAME = "";
            resume.LAST_NAME = "";
        }

        // Ищем телефон в разных возможных местах
        let phone_block = document.querySelector('[data-qa="resume-contact-phone"] > a');
        if (!phone_block) {
            phone_block = document.querySelector('[data-qa="resume-contact-phone"]');
        }
        if (!phone_block) {
            // Дополнительные селекторы для поиска телефона
            phone_block = document.querySelector('div[data-qa="resume-contact-phone"]');
        }
        if (!phone_block) {
            // Ищем по классам, если data-qa не работает
            phone_block = document.querySelector('.resume-contact-phone');
        }

        if (phone_block && phone_block.innerText.trim()) {
            const phoneText = phone_block.innerText.trim();
            resume.PHONE = [{ VALUE: phoneText, VALUE_TYPE: 'WORK' }];
        }

        const email_block = document.querySelector('[data-qa="resume-contact-email"] span');
        if (email_block && email_block.innerText.trim()) {
            resume.EMAIL = [{ VALUE: email_block.innerText.trim(), VALUE_TYPE: 'WORK' }];
        }

        // Добавляем resume в vacancy для удобства доступа
        vacancy.resume = resume;

        // Отладочная информация
        console.log('Собранные данные резюме:', resume);
        console.log('Собранные данные вакансии:', vacancy);

        return { resume, vacancy };
    } catch (error) {
        console.error('Ошибка при извлечении данных со страницы:', error);
        return null;
    }
}

function sendToBitrix(data = null) {
    if (!data) {
        loader.style.display = "none";
        status_mess.innerHTML = "<h3 style='color: red'>Что-то пошло не так!</h3>";
        saveToBitrixBtn.disabled = false;
        return;
    }
    saveToBitrixBtn.disabled = true;

    chrome.storage.local.get(['webhook_url', 'user_data']).then((res) => {
        const webhook_url = res.webhook_url;
        const user_info = res.user_data;

        if (!webhook_url) {
            alert("Webhook URL не найден. Пожалуйста, вернитесь на страницу авторизации.");
            location.href = "/index.html";
            return;
        }

        try {
            console.log('=== НАЧАЛО ОБРАБОТКИ ===');
            const contact_id = handleContact(data.resume, webhook_url, user_info);
            console.log('Получен contact_id:', contact_id);
            if (contact_id) {
                console.log('=== ПЕРЕХОДИМ К ОБРАБОТКЕ СДЕЛКИ ===');
                handleDeal(data.vacancy, webhook_url, user_info, contact_id);
            } else {
                console.log('contact_id не получен, пропускаем создание сделки');
            }
        } catch (error) {
            console.error('Ошибка при обработке данных:', error);
            displayStatus('Произошла ошибка при обработке данных', 'red');
        } finally {
            // Всегда скрываем лоадер и включаем кнопку обратно
            loader.style.display = "none";
            saveToBitrixBtn.disabled = false;
        }
    });
}

function handleContact(resume, webhook_url, user_info) {
    try {
        // Проверяем наличие телефона
        if (!resume.PHONE || !resume.PHONE[0] || !resume.PHONE[0].VALUE) {
            displayStatus("Не найден номер телефона в резюме. Проверьте, что телефон отображается на странице.", 'red');
            return null;
        }

        const contactExists = callAjax(`${webhook_url}/crm.contact.list`, {
            filter: { PHONE: resume.PHONE[0].VALUE }
        }, 'post');

        if (contactExists?.result?.length) {
            const contact = contactExists.result[0];
            displayStatus(`Контакт с таким номером уже есть: ${contact.LAST_NAME} ${contact.NAME}`, 'orange');
            return contact.ID;
        }

        const new_contact = callAjax(`${webhook_url}/crm.contact.add`, {
            fields: { ...resume, ASSIGNED_BY_ID: user_info.ID }
        }, 'post');

        if (new_contact?.result) {
            displayStatus(`Контакт успешно создан: ${resume.LAST_NAME} ${resume.NAME}`, 'green');
            return new_contact.result;
        }

        displayStatus("Ошибка создания контакта.", 'red');
        return null;
    } catch (error) {
        console.error('Ошибка в handleContact:', error);
        displayStatus("Произошла ошибка при работе с контактом", 'red');
        return null;
    }
}

function handleDeal(vacancy, webhook_url, user_info, contact_id) {
    console.log('=== ВХОД В handleDeal ===');
    console.log('vacancy.resumeId:', vacancy.resumeId);
    console.log('contact_id:', contact_id);

    try {
        // СНАЧАЛА проверяем, существует ли уже сделка с таким резюме
        console.log('Проверяем существование сделки для resumeId:', vacancy.resumeId);

        // Проверяем, что resumeId не пустой
        if (!vacancy.resumeId || vacancy.resumeId.trim() === '') {
            console.log('resumeId пустой, пропускаем проверку существования сделки');
            displayStatus('Не удалось определить ID резюме, создаем сделку без проверки дубликатов', 'orange');
        } else {
            console.log('Отправляем запрос на поиск сделки с фильтром:', { UF_CRM_1708209177676: vacancy.resumeId });
            const dealExists = callAjax(`${webhook_url}/crm.deal.list`, {
                filter: { UF_CRM_1708209177676: vacancy.resumeId }
            }, 'post');

            console.log('ПОЛНЫЙ результат проверки существования сделки:', dealExists);
            console.log('dealExists.result:', dealExists?.result);
            console.log('Тип dealExists.result:', typeof dealExists?.result);
            console.log('Длина массива dealExists.result:', dealExists?.result?.length);

            // Более строгая проверка результата
            if (dealExists &&
                !dealExists.error &&
                dealExists.result &&
                Array.isArray(dealExists.result) &&
                dealExists.result.length > 0) {

                displayStatus(`Сделка уже существует: ${dealExists.result[0].TITLE}`, 'orange');

                // Формируем поля для обновления
                const resumeName = vacancy.resume?.LAST_NAME && vacancy.resume?.NAME
                    ? `${vacancy.resume.LAST_NAME} ${vacancy.resume.NAME}`
                    : 'Неизвестный кандидат';

                const dealFields = {
                    TITLE: `${vacancy.vacancyName || 'Вакансия'} / ${resumeName}`,
                    CONTACT_ID: contact_id,
                    ASSIGNED_BY_ID: user_info.ID,
                    UF_CRM_1708209177676: vacancy.resumeId,
                    COMMENTS: buildDealComments(vacancy),
                };

                // Предлагаем обновить существующую сделку
                const updateDeal = confirm("Сделка уже существует. Обновить данные в существующей сделке?");
                if (updateDeal) {
                    const dealId = dealExists.result[0].ID;
                    const updated_deal = callAjax(`${webhook_url}/crm.deal.update`, {
                        id: dealId,
                        fields: dealFields
                    }, 'post');

                    if (updated_deal?.result) {
                        displayStatus(`Сделка обновлена: ${dealFields.TITLE}`, 'green');
                    } else {
                        displayStatus("Ошибка обновления сделки.", 'red');
                    }
                }
                return; // ВЫХОДИМ, не создаем новую сделку
            } else if (dealExists && dealExists.error) {
                console.log('Ошибка при проверке существования сделки:', dealExists.error);
                displayStatus('Ошибка при проверке существования сделки, создаем новую', 'orange');
            } else {
                console.log('Сделка не найдена, создаем новую');
            }
        }

        // ТОЛЬКО ЕСЛИ сделка не найдена - создаем новую
        console.log('=== СОЗДАНИЕ НОВОЙ СДЕЛКИ ===');

        // Формируем название сделки более безопасно
        const resumeName = vacancy.resume?.LAST_NAME && vacancy.resume?.NAME
            ? `${vacancy.resume.LAST_NAME} ${vacancy.resume.NAME}`
            : 'Неизвестный кандидат';

        // Подготавливаем поля сделки с правильным маппингом
        const dealFields = {
            TITLE: `${vacancy.vacancyName || 'Вакансия'} / ${resumeName}`,
            CONTACT_ID: contact_id,
            ASSIGNED_BY_ID: user_info.ID,
            // Пользовательские поля - нужно уточнить правильные коды полей
            UF_CRM_1708209177676: vacancy.resumeId, // ID резюме
            // Добавляем дополнительные поля в комментарии
            COMMENTS: buildDealComments(vacancy),
        };

        // Функция для формирования подробных комментариев
        function buildDealComments(vacancy) {
            let comments = `=== ИНФОРМАЦИЯ О КАНДИДАТЕ ===\n`;
            comments += `Имя: ${vacancy.resume?.LAST_NAME || ''} ${vacancy.resume?.NAME || ''}\n`;
            comments += `Возраст: ${vacancy.age || 'не указан'}\n`;
            comments += `Пол: ${vacancy.gender || 'не указан'}\n`;
            comments += `Адрес: ${vacancy.address || 'не указан'}\n`;

            if (vacancy.position && vacancy.position.trim()) {
                comments += `Желаемая должность: ${vacancy.position}\n`;
            }

            if (vacancy.salary && vacancy.salary.trim()) {
                comments += `Желаемая зарплата: ${vacancy.salary}\n`;
            }

            if (vacancy.languages && vacancy.languages.trim()) {
                comments += `Языки: ${vacancy.languages}\n`;
            }

            comments += `Дата обработки: ${vacancy.date}\n`;
            comments += `Ссылка на резюме: ${vacancy.resumeLink}\n\n`;

            if (vacancy.experience && vacancy.experience.trim()) {
                comments += `=== ОПЫТ РАБОТЫ ===\n${vacancy.experience}\n\n`;
            } else {
                comments += `=== ОПЫТ РАБОТЫ ===\nНе указан\n\n`;
            }

            if (vacancy.education && vacancy.education.trim()) {
                comments += `=== ОБРАЗОВАНИЕ ===\n${vacancy.education}\n\n`;
            } else {
                comments += `=== ОБРАЗОВАНИЕ ===\nНе указано\n\n`;
            }

            if (vacancy.skills && vacancy.skills.trim()) {
                comments += `=== КЛЮЧЕВЫЕ НАВЫКИ ===\n${vacancy.skills}\n\n`;
            } else {
                comments += `=== КЛЮЧЕВЫЕ НАВЫКИ ===\nНе указаны\n\n`;
            }

            if (vacancy.aboutCandidate && vacancy.aboutCandidate.trim()) {
                comments += `=== О КАНДИДАТЕ ===\n${vacancy.aboutCandidate}\n\n`;
            }

            if (vacancy.comments && vacancy.comments.trim()) {
                comments += `=== КОММЕНТАРИИ HR ===\n${vacancy.comments}\n`;
            }

            return comments;
        }



        // Создаем новую сделку
        console.log('Отправляем данные сделки:', dealFields);
        const new_deal = callAjax(`${webhook_url}/crm.deal.add`, { fields: dealFields }, 'post');
        console.log('Полный ответ при создании сделки:', new_deal);

        if (new_deal?.result) {
            displayStatus(`Сделка успешно создана: ${dealFields.TITLE}`, 'green');
        } else {
            displayStatus("Ошибка создания сделки.", 'red');
            if (new_deal?.error_description) {
                displayStatus(`Детали ошибки: ${new_deal.error_description}`, 'red');
            }
        }
    } catch (error) {
        console.error('Ошибка в handleDeal:', error);
        displayStatus("Произошла ошибка при работе со сделкой", 'red');
    }
}

function callAjax(url, data = null, method = 'post') {
    let result = null;
    try {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        result = JSON.parse(xhr.responseText);
                        // Дополнительная проверка структуры ответа Bitrix24
                        if (result && typeof result === 'object') {
                            // Если есть ошибка в ответе Bitrix24
                            if (result.error) {
                                console.error('Ошибка API Bitrix24:', result.error, result.error_description);
                            }
                            // Если result не определен, устанавливаем пустой массив
                            if (result.result === undefined) {
                                result.result = [];
                            }
                        }
                    } catch (parseError) {
                        console.error('Ошибка парсинга JSON:', parseError);
                        console.error('Ответ сервера:', xhr.responseText);
                        result = { error: 'Ошибка парсинга ответа сервера', result: [] };
                    }
                } else {
                    console.error(`HTTP Error: ${xhr.status} - ${xhr.statusText}`);
                    console.error('Ответ сервера:', xhr.responseText);
                    result = { error: `HTTP Error: ${xhr.status}`, result: [] };
                }
            }
        };
        xhr.send(JSON.stringify(data));
    } catch (error) {
        console.error('Ошибка AJAX запроса:', error);
        result = { error: 'Ошибка сетевого запроса', result: [] };
    }
    return result;
}

function displayStatus(message, color) {
    const div = document.createElement('div');
    div.innerHTML = message;
    div.style.marginBottom = '5px';
    div.style.padding = '5px';
    div.style.borderRadius = '3px';

    // Устанавливаем цвет в зависимости от типа сообщения
    switch(color) {
        case 'green':
            div.style.color = '#4CAF50';
            div.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
            break;
        case 'red':
            div.style.color = '#f44336';
            div.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
            break;
        case 'orange':
            div.style.color = '#ff9800';
            div.style.backgroundColor = 'rgba(255, 152, 0, 0.1)';
            break;
        default:
            div.style.color = color;
    }

    status_mess.appendChild(div);
}